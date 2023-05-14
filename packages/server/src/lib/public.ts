/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import express, { Application } from 'express';
import { IncomingMessage } from 'http';
import WebSocket from 'isomorphic-ws';
import { Db } from 'mongodb';
import { Subject } from 'rxjs';

import {
  DefaultEmailPasswordResetTemplate,
  DefaultEmailProvider,
  DocumentLiveQuery,
  EleganteError,
  ErrorCode,
  init,
  InternalCollectionName,
  InternalHeaders,
  log,
  pointer,
  print,
  query,
  Session,
  User,
} from '@elegante/sdk';

import { Cache } from './Cache';
import { handleOn, handleOnce, LiveQueryServerParams } from './LiveQueryServer';
import { rest } from './rest';
import {
  createIndexes,
  EleganteServer,
  ensureCacheInvalidation,
  ensureSessionInvalidation,
  mongoConnect,
  ServerParams,
} from './Server';
import { newToken } from './utils';
import { Version } from './Version';

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

  /**
   * set default plugins
   */
  const emailPasswordResetTemplate = params.plugins?.find(
    (it) => it['EmailPasswordResetTemplate' as keyof typeof it]
  );

  const emailProviderPlugin = params.plugins?.find(
    (it) => it['EmailProvider' as keyof typeof it]
  );

  if (!emailProviderPlugin) {
    params.plugins = [
      ...(params.plugins ?? []),
      {
        name: 'EmailProvider',
        version: '0.0.0',
        EmailProvider() {
          // implement your own email provider
          // follow the interface defined in the DefaultEmailProvider
          return DefaultEmailProvider();
        },
      },
    ];
  }

  if (!emailPasswordResetTemplate) {
    params.plugins = [
      ...(params.plugins ?? []),
      {
        name: 'EmailPasswordResetTemplate',
        version: '0.0.0',
        EmailPasswordResetTemplate({ token, user, baseUrl }) {
          return DefaultEmailPasswordResetTemplate({ token, user, baseUrl });
        },
      },
    ];
  }

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
  const { debug, collections, httpServer, upgrade, port } = options;

  if (upgrade && !httpServer) {
    throw new EleganteError(
      ErrorCode.LIVE_QUERY_INVALID_PARAMS,
      'LiveQuery server upgrade requires an http server'
    );
  }

  const connections = new Map();
  const wssOptions = upgrade
    ? {
        noServer: true,
      }
    : {
        port,
      };

  const wss = new WebSocket.Server(wssOptions, () => {
    // this is ignored when upgrade
    if (debug) {
      print(`LiveQuery running on port ${options.port}`, connections.values());
    }
  });

  if (upgrade) {
    httpServer.on('upgrade', (request, socket, head) => {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    });
  }


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
      print(
        new EleganteError(ErrorCode.AUTH_INVALID_API_KEY, 'Invalid API Key')
      );
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
            ErrorCode.QUERY_NOT_ALLOWED,
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
