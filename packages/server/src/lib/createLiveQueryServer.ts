/* eslint-disable @typescript-eslint/no-explicit-any */
import WebSocket, { ServerOptions } from 'ws';

import { IncomingMessage } from 'http';
import { Document, ChangeStreamUpdateDocument } from 'mongodb';

import {
  DocumentLiveQuery,
  DocumentEvent,
  LiveQueryMessage,
  EleganteError,
  ErrorCode,
  log,
  isDate,
  print,
} from '@elegante/sdk';

import { EleganteServer } from './EleganteServer';
import { createPipeline } from './createPipeline';
import { parseQuery } from './parseQuery';
import { parseDoc, parseDocs } from './parseDoc';

export interface LiveQueryServerParams extends ServerOptions {
  collections: string[]; // allowed collections
  port: number;
  debug?: boolean;
}

export interface LiveQueryServerEvents {
  onLiveQueryConnect: (
    ws: WebSocket,
    incoming: IncomingMessage
    // connections?: Map<WebSocket, any> // not sure yet
  ) => void;
}

/**
 * spin up a new elegante live query server instance
 *
 * @export
 * @param {LiveQueryServerParams} options
 * @param {LiveQueryServerEvents} [events={
 *     // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
 *     onLiveQueryConnect: () => {},
 *   }]
 */
export function createLiveQueryServer(
  options: LiveQueryServerParams,
  events: LiveQueryServerEvents = {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
    onLiveQueryConnect: () => {},
  }
) {
  const { debug } = options;

  const connections = new Map();

  const { onLiveQueryConnect } = events;

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

    // {
    //   host: 'localhost:3136',
    //   connection: 'Upgrade',
    //   pragma: 'no-cache',
    //   'cache-control': 'no-cache',
    //   'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
    //   upgrade: 'websocket',
    //   origin: 'http://localhost:4200',
    //   'sec-websocket-version': '13',
    //   'accept-encoding': 'gzip, deflate, br',
    //   'accept-language': 'en-US,en;q=0.9',
    //   cookie: 'g_state={"i_l":0}; inl={"token":"r:3d57eeade3e43d13476cc1fbbb932040","avatar":""}',
    //   'sec-websocket-key': 'qkd6T8tGnbu8ZRKfvr7dsg==',
    //   'sec-websocket-extensions': 'permessage-deflate; client_max_window_bits',
    //   'sec-websocket-protocol': 'ELEGANTE_SERVER, sessionToken'
    // }

    // extract websocket protocols from headers
    const protocols = headers['sec-websocket-protocol'];
    // 'apiKey, sessionToken'

    // extract session token from protocols
    const protocolsArray = protocols ? protocols.split(',') : [];

    if (protocolsArray[0] !== EleganteServer.params.apiKey) {
      /**
       * throw an error log so we can know if someone is trying to connect to the live query server
       */
      console.log(
        new EleganteError(ErrorCode.INVALID_API_KEY, 'Invalid API Key')
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
    onLiveQueryConnect(ws, incoming /*, connections*/);

    /**
     * handle incoming query messages
     */
    ws.on('message', (queryAsString: string) => {
      // queryAsString = queryAsString.slice(0, 2048); // ?? max message length will be 2048
      const query: DocumentLiveQuery = JSON.parse(queryAsString);
      const { collection, method, event } = query;

      /**
       * throw exception if the requested collection is not allowed
       */
      if (!options.collections.includes(collection)) {
        console.log(
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
        handleOnce(query, ws);
        connections.delete(ws);
        ws.close();
      } else {
        console.log(
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
}

/**
 * deal with realtime queries where we need to
 * prepend `fullDocument` to the field name
 * if it's not an operator ie: doesn't start with `$`
 */

function addFullDocumentPrefix(obj: any | Array<any>) {
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

function handleOn(
  rawQuery: DocumentLiveQuery,
  ws: WebSocket,
  requestedEvent: DocumentEvent,
  connections: Map<WebSocket, any>
  // incoming: IncomingMessage,
  //
) {
  const { filter, pipeline, projection, collection } = rawQuery;

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
          pipeline,
          projection: projection ?? {},
        })
      ),
    ],
    {
      fullDocument: 'updateLookup',
    }
  );

  stream.on('error', (err) => {
    log('stream error', err); // @todo doc this
    // close websocket connection with stream error
    connections.delete(ws);
    ws.close(1008, err.toString());
    stream.close();
  });

  stream.on('close', () => {
    log('stream closed');
    connections.delete(ws);
    ws.close(1008, 'stream closed');
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
        doc: await parseDoc(fullDocument)(rawQuery, EleganteServer.params, {}),
      };
    } else if (
      operationType === requestedEvent &&
      ['insert', 'replace', 'update'].includes(operationType)
    ) {
      message = {
        doc: await parseDoc(fullDocument)(rawQuery, EleganteServer.params, {}),
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
async function handleOnce(rawQuery: DocumentLiveQuery, ws: WebSocket) {
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
      pipeline,
      projection: projection ?? {},
      limit: limit ?? 10000,
      skip: skip ?? 0,
      sort: sort ?? {},
    }),
    options
  );

  for await (const doc of cursor) {
    docs.push(doc);
  }

  /**
   * send the message over the wire to the client
   */
  const message: LiveQueryMessage = {
    docs: await parseDocs(docs)(query, EleganteServer.params, {}),
  };

  ws.send(JSON.stringify(message));
}
