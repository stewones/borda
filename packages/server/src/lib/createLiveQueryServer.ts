/* eslint-disable @typescript-eslint/no-explicit-any */
import { Document, ChangeStreamUpdateDocument } from 'mongodb';
import { DocumentQueryUnlock, ElegError, ErrorCode, log } from '@elegante/sdk';

import WebSocket, { ServerOptions } from 'ws';
import { IncomingMessage } from 'http';
import { newObjectId } from './utils/crypto';
import { ElegServer } from './ElegServer';
import { createPipeline } from './createPipeline';

export interface LiveQueryServerParams extends ServerOptions {
  collections: string[]; // allowed collections
  port: number;
}

export interface LiveQueryServerEvents {
  onLiveQueryConnect: (ws: WebSocket, incoming: IncomingMessage) => void;
}

export interface LiveQueryMessage {
  doc?: Document | undefined;
  docs?: Document[] | undefined;
  updatedFields?: Partial<Document> | undefined;
  removedFields?: string[] | undefined;
  truncatedArrays?:
    | Array<{
        /** The name of the truncated field. */
        field: string;
        /** The number of elements in the truncated array. */
        newSize: number;
      }>
    | undefined;
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

      // mongodb only allow certain operators in the pipeline to watch
      const { filter, pipeline, projection, collection, method } = query;

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
       * watch the query
       */
      if (method === 'on') {
        const task = ElegServer.db.collection(collection);
        task.aggregate(
          createPipeline<Document>({
            filter: filter ?? ({} as any),
            pipeline,
            projection: projection ?? {},
          })
        );

        const stream = task.watch([], {
          fullDocument: 'updateLookup',
        });

        stream.on('change', (change: ChangeStreamUpdateDocument) => {
          console.log(change);

          const {
            fullDocument,
            operationType,
            documentKey,
            updateDescription,
          } = change;
          const { updatedFields, removedFields, truncatedArrays } =
            updateDescription ?? {};

          /**
           * send the message over the wire to the client
           */
          const message: LiveQueryMessage = {
            doc: fullDocument,
            docs: undefined,
            updatedFields,
            removedFields,
            truncatedArrays,
          };

          ws.send(JSON.stringify(message));

          // example for multicasting
          // const metadata = clients.get(ws);
          // [...clients.keys()].forEach((client) => {
          //   console.log('client', client.metadata);
          //   client.send(JSON.stringify(message));
          // });
        });

        stream.on('error', (err) => {
          console.error('error', err);
        });
      }

      if (method === 'once') {
      }

      // otherwise close connection
      ws.close(1008);
    });

    ws.on('close', () => {
      log('livequery connection closed');
      // clients.delete(ws);
    });
  });
}
