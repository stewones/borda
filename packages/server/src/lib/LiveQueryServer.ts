/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import WebSocket, { ServerOptions } from 'ws';
import {
  Document,
  ChangeStreamUpdateDocument,
  AggregateOptions,
} from 'mongodb';

import {
  DocumentLiveQuery,
  DocumentEvent,
  LiveQueryMessage,
  EleganteError,
  ErrorCode,
  log,
  isDate,
} from '@elegante/sdk';

import { EleganteServer, createPipeline } from './Server';
import { parseQuery } from './parseQuery';
import { parseDoc, parseDocs } from './parseDoc';

export interface LiveQueryServerParams extends ServerOptions {
  collections: string[]; // allowed collections
  port: number;
  debug?: boolean;
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
          pipeline,
          projection: projection ?? {},
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
        docs: [],
      };
    } else if (
      operationType === requestedEvent &&
      ['insert', 'replace', 'update'].includes(operationType)
    ) {
      message = {
        doc: await parseDoc(fullDocument)(rawQuery, EleganteServer.params, {}),
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
      pipeline,
      projection: projection ?? {},
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
    docs: await parseDocs(docs)(query, EleganteServer.params, {}),
    doc: null,
  };

  ws.send(JSON.stringify(message));

  /**
   * close connection
   */
  connections.delete(ws);
  ws.close();
}
