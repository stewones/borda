/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

import { IncomingMessage, Server, ServerResponse } from 'http';
import WebSocket, { ServerOptions } from 'isomorphic-ws';
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  AggregateOptions,
  ChangeStreamUpdateDocument,
  Db,
  Document,
} from 'mongodb';
import { Subject } from 'rxjs';

import {
  DocumentEvent,
  DocumentLiveQuery,
  EleganteError,
  ErrorCode,
  InternalCollectionName,
  isDate,
  isEmpty,
  LiveQueryMessage,
  log,
  print,
  query,
  Session,
} from '@elegante/sdk';

import { Cache } from './Cache';
import { parseDoc, parseDocs } from './parseDoc';
import { parseProjection } from './parseProjection';
import { parseQuery } from './parseQuery';
import {
  createPipeline,
  EleganteServer,
  ensureCacheInvalidation,
  ensureSessionInvalidation,
} from './Server';

export interface LiveQueryServerParams extends ServerOptions {
  httpServer: Server<typeof IncomingMessage, typeof ServerResponse>;
  collections: string[]; // allowed collections
  reservedCollections?: string[]; // reserved collections (cannot be used). default to InternalCollectionName
  debug?: boolean;
  port?: number; // ignored if upgrade
  upgrade?: boolean; // this is the same as noServer:true
}

/**
 * deal with realtime queries where we need to
 * prepend `fullDocument` to the field name
 * if it's not an operator ie: doesn't start with `$`
 */
export function addFullDocumentPrefix(obj: any | Array<any>) {
  if (Array.isArray(obj)) {
    obj.map((item: any) => addFullDocumentPrefix(item));
  } else {
    for (const field in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, field)) {
        const value = obj[field];
        if (!field.includes('$') && !field.startsWith('fullDocument.')) {
          obj[`fullDocument.${field}`] = value;
          delete obj[field];
        }
      }

      if (typeof obj[field] === 'object') {
        addFullDocumentPrefix(obj[field]);
      }
    }
  }

  return obj;
}

export function handleOn(
  rawQuery: DocumentLiveQuery,
  ws: WebSocket,
  requestedEvent: DocumentEvent,
  connections: Map<WebSocket, any>
  // incoming: IncomingMessage,
  //
) {
  const { filter, pipeline, projection, collection } = rawQuery;

  if (!EleganteServer.db)
    throw new EleganteError(ErrorCode.DATABASE_NOT_FOUND, 'Database not found');

  const task = EleganteServer.db.collection(collection);

  const stream = task.watch(
    [
      {
        $match: {
          operationType: {
            $in: [requestedEvent === 'delete' ? 'update' : requestedEvent],
          },
        },
      },
      ...addFullDocumentPrefix(
        createPipeline<Document>({
          filter: filter ?? ({} as any),
          pipeline: pipeline ?? ([] as any),
        })
      ),
    ],
    {
      fullDocument: 'updateLookup',
    }
  );

  ws.on('close', () => {
    stream.close();
    stream.removeAllListeners();
  });

  stream.on('error', (err) => {
    log('stream error', err); // @todo doc this
    // close websocket connection with stream error
    connections.delete(ws);
    ws.close(1000, err.toString());
    stream.close();
  });

  stream.on('close', () => {
    log('stream closed');
    connections.delete(ws);
    ws.close(1000, 'stream closed');
  });

  stream.on('init', () => {
    log('stream initialized');
  });

  stream.on('change', async (change: ChangeStreamUpdateDocument) => {
    const { fullDocument, operationType, updateDescription } = change;
    const { updatedFields, removedFields, truncatedArrays } =
      updateDescription ?? {};

    // console.log('stream change', change);

    let message: LiveQueryMessage | ChangeStreamUpdateDocument | undefined =
      undefined;

    /**
     * check if it's deleted
     */
    const isDeleted =
      requestedEvent === 'delete' &&
      fullDocument &&
      fullDocument['_expires_at'] &&
      isDate(fullDocument['_expires_at']);

    if (isDeleted) {
      message = {
        doc: parseProjection(
          projection ?? {},
          await parseDoc(fullDocument)(rawQuery, EleganteServer.params, {})
        ),
        docs: [],
      };
    } else if (
      operationType === requestedEvent &&
      ['insert', 'replace', 'update'].includes(operationType)
    ) {
      message = {
        doc: parseProjection(
          projection ?? {},
          await parseDoc(fullDocument)(rawQuery, EleganteServer.params, {})
        ),
        docs: [],
        updatedFields,
        removedFields,
        truncatedArrays,
      };
    } else if (!['delete'].includes(operationType)) {
      if (operationType === requestedEvent) {
        message = {
          ...change,
        };
      }
    }

    /**
     * send the message over the wire to the client
     */
    if (message) {
      ws.send(JSON.stringify(message));
      // example for multicasting

      // [...connections.keys()].forEach((ws) => {
      //   const metadata = connections.get(ws);
      //   console.log('metadata', metadata);

      //   if (metadata.addr === incoming.socket.remoteAddress) {
      //     ws.send(JSON.stringify(message));
      //   }
      // });
    }
  });
}

/**
 * Should behavior similiar to query.aggregate which is a stronger query.find
 * but here we have the advantage to traffic over the wire with websockets
 *
 * @param {DocumentLiveQuery} rawQuery
 * @param {WebSocket} ws
 */
export async function handleOnce(
  rawQuery: DocumentLiveQuery,
  ws: WebSocket,
  connections: Map<WebSocket, any>
) {
  const docs: Document[] = [];

  const query = parseQuery(rawQuery);

  const {
    filter,
    limit,
    sort,
    projection,
    options,
    skip,
    pipeline,
    collection$,
  } = query;

  const cursor = collection$.aggregate<Document>(
    createPipeline<Document>({
      filter: filter ?? {},
      pipeline: pipeline ?? ([] as any),
      limit: limit ?? 10000,
      skip: skip ?? 0,
      sort: sort ?? {},
    }),
    options as AggregateOptions
  );

  for await (const doc of cursor) {
    docs.push(doc);
  }

  /**
   * send the message over the wire to the client
   */
  const message: LiveQueryMessage = {
    docs: parseProjection(
      projection ?? ({} as any),
      await parseDocs(docs)(query, EleganteServer.params, {})
    ),
    doc: null,
  };

  ws.send(JSON.stringify(message));

  /**
   * close connection
   */
  connections.delete(ws);
  ws.close();
}

export abstract class ServerEvents {
  public static onDatabaseConnect = new Subject<{ db: Db }>();
  public static onLiveQueryConnect = new Subject<{
    ws: WebSocket;
    incoming: IncomingMessage;
  }>();
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

  wss.on('connection', async (ws: WebSocket, incoming: IncomingMessage) => {
    if (debug) {
      print('LiveQuery connection open', connections.values());
    }
    ws.on('close', () => {
      connections.delete(ws);

      if (debug) {
        print('LiveQuery connection closed', connections.values());
      }
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

    const apiKey = protocolsArray[0] && protocolsArray[0].trim();
    const token = protocolsArray[1] && protocolsArray[1].trim();
    const apiSecret = protocolsArray[2] && protocolsArray[2].trim();
    const hasToken = token && token !== 'null' && token !== 'undefined';

    // console.log('apiKey', apiKey);
    // console.log('token', token, typeof token);
    // console.log('apiSecret', apiSecret);

    if (apiKey !== EleganteServer.params.apiKey) {
      /**
       * throw an error log so we can know if someone is trying to connect to the live query server
       */
      print(
        new EleganteError(ErrorCode.AUTH_INVALID_API_KEY, 'Invalid API Key')
      );
      return ws.close(1000, 'Invalid key');
    }

    // check for secret
    if (apiSecret && apiSecret !== EleganteServer.params.apiSecret) {
      /**
       * throw an error log so we can know if someone is trying to connect to the live query server
       */
      print(
        new EleganteError(ErrorCode.LIVE_QUERY_INVALID_SECRET, 'Invalid secret')
      );
      return ws.close(1000, 'Invalid secret');
    }

    /**
     * validate session token (same as REST API)
     * we need to make sure the default is session token required
     *
     * server can unlock by passing a third param which is the server secret
     *
     * @todo
     * add the ability to bypass this option granually per request
     * in case of some public query in realtime
     *
     * so the SDK client would add "unlock" to the protocol then we allow the connection
     *
     * for security purposes users may want to implement beforeFind and beforeAggregate hooks
     * by themselves to make sure the query is safe
     */
    if (!apiSecret && !hasToken) {
      /**
       * throw an error log so we can know if someone is trying to connect to the live query server
       */
      print(
        new EleganteError(
          ErrorCode.LIVE_QUERY_INVALID_SESSION,
          'Invalid session'
        )
      );
      return ws.close(1000, 'Invalid session');
    }

    if (hasToken) {
      // validate session token (add back `:` to the second char because we needed to strip it in the client)
      const tokenToValidate = `${token[0]}:${token.slice(1)}`;

      const memo = Cache.get('Session', token);
      if (!memo) {
        const session = await query<Session>('Session')
          .unlock()
          .include(['user'])
          .filter({
            token: {
              $eq: tokenToValidate,
            },
            expiresAt: {
              $gt: new Date().toISOString(),
            },
          })
          .findOne();

        if (!isEmpty(session)) {
          // cache the session itself
          Cache.set('Session', session.token, session);
          // cache a reference to the session token which belongs to the user
          Cache.set('Session$token', session.user.objectId, {
            token: session.token,
          });
        } else {
          return ws.close(1000, 'Invalid session');
        }
      }
    }

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
      const reservedCollections =
        options.reservedCollections || Object.keys(InternalCollectionName);
      if (reservedCollections.includes(collection)) {
        const message = `You can't subscribe to the collection ${collection} because it's reserved`;
        log(
          new EleganteError(ErrorCode.LIVE_QUERY_INVALID_COLLECTION, message)
        );
        return ws.close(1000, message);
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
        return ws.close(1000, 'Collection not allowed');
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
        if (debug) {
          print('LiveQuery connections', connections.values());
        }
        return ws.close(1000, 'Invalid query method');
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
