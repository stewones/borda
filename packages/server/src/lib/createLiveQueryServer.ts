/* eslint-disable @typescript-eslint/no-explicit-any */
import WebSocket, { ServerOptions } from 'ws';
import { IncomingMessage } from 'http';
import { Document, ChangeStreamUpdateDocument } from 'mongodb';
import {
  DocumentQueryUnlock,
  ElegError,
  ErrorCode,
  log,
  LiveQueryMessage,
  DocumentEvent,
} from '@elegante/sdk';

import { ElegServer } from './ElegServer';
import { createPipeline } from './createPipeline';
import { parseQuery } from './parseQuery';
import { parseDoc, parseDocs } from './parseDoc';

export interface LiveQueryServerParams extends ServerOptions {
  collections: string[]; // allowed collections
  port: number;
}

export interface LiveQueryServerEvents {
  onLiveQueryConnect: (ws: WebSocket, incoming: IncomingMessage) => void;
}

/**
 * spin up a new elegante live query server instance
 *
 * @export
 * @param {LiveQueryServerParams} options
 * @param {LiveQueryServerEvents} [events={
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
  const { onLiveQueryConnect } = events;

  const wss = new WebSocket.Server(options, () =>
    log(`LiveQuery running on port ${options.port}`)
  );

  // const clients = new Map();

  wss.on('connection', (ws: WebSocket, incoming: IncomingMessage) => {
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

    if (protocolsArray[0] !== ElegServer.params.apiKey) {
      /**
       * throw an error log so we can know if someone is trying to connect to the live query server
       */
      console.log(new ElegError(ErrorCode.INVALID_API_KEY, 'Invalid API Key'));
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

    // add connection identifier to metadata
    // this is for multicasting. not sure yet.
    // const connection = newObjectId();
    // const metadata = { connection };
    // clients.set(ws, metadata);
    // callback to the consumer
    onLiveQueryConnect(ws, incoming);

    /**
     * handle incoming query messages
     */
    ws.on('message', (queryAsString: string) => {
      // queryAsString = queryAsString.slice(0, 2048); // ?? max message length will be 2048
      const query: DocumentQueryUnlock = JSON.parse(queryAsString);
      const { collection, method, event } = query;

      /**
       * throw exception if the requested collection is not allowed
       */
      if (!options.collections.includes(collection)) {
        console.log(
          new ElegError(
            ErrorCode.COLLECTION_NOT_ALLOWED,
            'Collection not allowed'
          )
        );
        // close connection
        return ws.close(1008, 'Collection not allowed');
      }

      /**
       * resolve the query in realtime or only once
       */
      if (method === 'on') {
        handleOn(query, ws, event ?? 'update');
      } else if (method === 'once') {
        handleOnce(query, ws);
      } else {
        console.log(
          new ElegError(ErrorCode.INVALID_QUERY_METHOD, 'Invalid query method')
        );
        // close connection
        return ws.close(1008, 'Invalid query method');
      }
    });

    ws.on('close', () => {
      log('livequery connection closed');
      // clients.delete(ws);
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
  rawQuery: DocumentQueryUnlock,
  ws: WebSocket,
  event: DocumentEvent
) {
  const { filter, pipeline, projection, collection } = rawQuery;

  const task = ElegServer.db.collection(collection);

  const stream = task.watch(
    [
      {
        $match: {
          operationType: {
            $in: [event],
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
      // {
      //   $match: {
      //     ['fullDocument._p_product']: {
      //       $eq: 'Product$MCU8z2gBoM',
      //     },
      //   },
      // },
    ],
    {
      fullDocument: 'updateLookup',
    }
  );

  stream.on('error', (err) => {
    log('stream error', err); // @todo doc this
    // close websocket connection with stream error
    ws.close(1008, err.toString());
    stream.close();
  });

  stream.on('close', () => {
    log('stream closed');
    ws.close(1008, 'stream closed');
  });

  stream.on('init', () => {
    log('stream initialized');
  });

  stream.on('change', async (change: ChangeStreamUpdateDocument) => {
    const { fullDocument, operationType, updateDescription } = change;
    const { updatedFields, removedFields, truncatedArrays } =
      updateDescription ?? {};

    let message: LiveQueryMessage | ChangeStreamUpdateDocument;

    if (['insert', 'replace', 'update'].includes(operationType)) {
      /**
       * check if it's deleted
       */
      if (fullDocument && fullDocument['_deleted_at']) {
        message = {
          doc: await parseDoc(fullDocument)(rawQuery, ElegServer.params, {}),
        };
      } else {
        message = {
          doc: await parseDoc(fullDocument)(rawQuery, ElegServer.params, {}),
          updatedFields,
          removedFields,
          truncatedArrays,
        };
      }
    } else {
      message = {
        ...change,
      };
    }

    /**
     * send the message over the wire to the client
     */
    if (operationType === event) {
      // console.log(change);
      ws.send(JSON.stringify(message));
    }

    // example for multicasting
    // const metadata = clients.get(ws);
    // [...clients.keys()].forEach((client) => {
    //   console.log('client', client.metadata);
    //   client.send(JSON.stringify(message));
    // });
  });
}

/**
 * Should behavior similiar to query.aggregate which is a stronger query.find
 * but here we have the advantage to traffic over the wire with websockets
 *
 * @param {DocumentQueryUnlock} rawQuery
 * @param {WebSocket} ws
 */
async function handleOnce(rawQuery: DocumentQueryUnlock, ws: WebSocket) {
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
    collection,
  } = query;

  const cursor = collection.aggregate<Document>(
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
    docs: await parseDocs(docs)(query, ElegServer.params, {}),
  };

  ws.send(JSON.stringify(message));
}
