/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import WebSocket from 'ws';
import express, { Application } from 'express';

import { Subject } from 'rxjs';
import { Db } from 'mongodb';
import { IncomingMessage } from 'http';

import {
  DocumentLiveQuery,
  EleganteError,
  ErrorCode,
  InternalCollectionName,
  log,
  print,
  query,
  pointer,
  init,
  User,
  Session,
  InternalHeaders,
} from '@elegante/sdk';

import {
  ServerParams,
  EleganteServer,
  mongoConnect,
  createIndexes,
  ensureSessionInvalidation,
  ensureCacheInvalidation,
} from './Server';

import { handleOn, handleOnce, LiveQueryServerParams } from './LiveQueryServer';
import { Cache } from './Cache';
import { rest } from './rest';
import { Version } from './Version';
import { newToken } from './utils';

export abstract class ServerEvents {
  public static onDatabaseConnect = new Subject<{ db: Db }>();
  public static onLiveQueryConnect = new Subject<{
    ws: WebSocket;
    incoming: IncomingMessage;
  }>();
}

export function createServer(options: Partial<ServerParams>): Application {
  const app = (EleganteServer.app = express());

  EleganteServer.params = { ...EleganteServer.params, ...options };
  const { params } = EleganteServer;

  init(params);
  rest({
    app,
    params,
  });

  mongoConnect({ params })
    .then((db) => {
      try {
        EleganteServer.db = db;
        createIndexes({ db, params });
        ServerEvents.onDatabaseConnect.next({ db });
      } catch (err) {
        print(err);
      }
    })
    .catch((err) => log(err));

  print(`Elegante Server v${Version}`);

  if (params.documentCacheTTL && params.documentCacheTTL <= 0) {
    Cache.disable();
    print('❗ Document cache has been disabled.');
    print(
      '❗ Be sure to set documentCacheTTL to a positive number in production to boost queries performance.'
    );
  }

  Cache.clock();

  return app;
}

export function createLiveQueryServer(options: LiveQueryServerParams) {
  const { debug, collections } = options;
  const connections = new Map();

  const wss = new WebSocket.Server(options, () => {
    if (debug) {
      print(`LiveQuery running on port ${options.port}`, connections.values());
    }
  });

  wss.on('close', () => {
    {
      if (debug) {
        print('LiveQuery connection closed', connections.values());
      }
    }
  });

  wss.on('connection', (ws: WebSocket, incoming: IncomingMessage) => {
    if (debug) {
      print('LiveQuery connection open', connections.values());
    }
    ws.on('close', () => {
      if (debug) {
        print('LiveQuery connection closed', connections.values());
      }

      connections.delete(ws);
    });

    // add connection identifier to metadata
    // this is for multicasting. not sure yet.
    const addr = incoming.socket.remoteAddress;
    const metadata = { addr };
    connections.set(ws, metadata);

    const { headers } = incoming;

    // extract websocket protocols from headers
    const protocols = headers['sec-websocket-protocol'];
    // 'apiKey, token'

    // extract session token from protocols
    const protocolsArray = protocols ? protocols.split(',') : [];

    if (protocolsArray[0] !== EleganteServer.params.apiKey) {
      /**
       * throw an error log so we can know if someone is trying to connect to the live query server
       */
      print(new EleganteError(ErrorCode.INVALID_API_KEY, 'Invalid API Key'));
      ws.close();
      return wss.close(); // close connection
    }

    /**
     * @todo - validate session token (same as REST API)
     * we need to make sure the default is session token required
     * or add the ability to bypass this option granually per request
     * in case of some public query in realtime
     *
     * so the SDK client would add "unlock" to the protocol then we allow the connection
     *
     * for security purposes users may want to implement beforeFind and beforeAggregate hooks
     * by themselves to make sure the query is safe
     */

    // callback to the consumer
    ServerEvents.onLiveQueryConnect.next({
      ws: ws as any,
      incoming /*, connections*/,
    });

    /**
     * handle incoming query messages
     */
    ws.on('message', (queryAsString: string) => {
      // queryAsString = queryAsString.slice(0, 2048); // ?? max message length will be 2048
      const query: DocumentLiveQuery = JSON.parse(queryAsString);
      const { collection, method, event } = query;

      /**
       * can't subscribe to any of the reserved collections
       */
      const reservedCollections = Object.keys(InternalCollectionName);
      if (reservedCollections.includes(collection)) {
        const message = `You can't subscribe to the collection ${collection} because it's reserved`;
        log(
          new EleganteError(ErrorCode.LIVE_QUERY_INVALID_COLLECTION, message)
        );
        return ws.close(1008, message);
      }

      /**
       * throw exception if the requested collection is not allowed
       */
      if (!collections.includes(collection)) {
        print(
          new EleganteError(
            ErrorCode.COLLECTION_NOT_ALLOWED,
            'Collection not allowed'
          )
        );
        // close connection
        connections.delete(ws);
        return ws.close(1008, 'Collection not allowed');
      }

      /**
       * resolve the query in realtime or only once
       */
      if (method === 'on') {
        handleOn(query, ws, event ?? 'update', connections);
      } else if (method === 'once') {
        handleOnce(query, ws, connections);
      } else {
        print(
          new EleganteError(
            ErrorCode.LIVE_QUERY_INVALID_QUERY_METHOD,
            'Invalid query method'
          )
        );
        // close connection
        connections.delete(ws);
        return ws.close(1008, 'Invalid query method');
      }
      if (debug) {
        print('LiveQuery connections', connections.values());
      }
    });
  });

  /**
   * listen to database changes to execute side effect tasks such as
   * - have a second layer of cache invalidation
   * - delete all user sessions if the user is deleted
   */
  ServerEvents.onDatabaseConnect.subscribe(async ({ db }) => {
    ensureCacheInvalidation(db);
    ensureSessionInvalidation(db);
  });
}

export async function createSession<T = Session>(user: User) {
  /**
   * because we don't want to expose the user password
   */
  delete user.password;

  /**
   * expires in 1 year
   * @todo make this an option ?
   */
  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  /**
   * generate a new session token
   */
  const token = `e:${newToken()}`;
  const session = await query('Session')
    .unlock()
    .insert({
      user: pointer('User', user.objectId),
      token,
      expiresAt: expiresAt.toISOString(),
    });

  return { ...session, user } as T;
}

export function prefixedServerHeaders() {
  const headers = [];
  for (const k in InternalHeaders) {
    headers.push(
      `${EleganteServer.params.serverHeaderPrefix}-${
        InternalHeaders[k as keyof typeof InternalHeaders]
      }`
    );
  }
  return headers;
}
