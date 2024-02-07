/**
 * @license
 * Copyright Borda All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://borda.dev/license
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { ChangeStreamUpdateDocument, Db, Document } from 'mongodb';
import { finalize, Observable } from 'rxjs';

import {
  DocumentFilter,
  DocumentLiveQuery,
  DocumentQuery,
  isDate,
  isEmpty,
  LiveQueryMessage,
} from '@borda/client';

import { Cache } from './Cache';
import { parseDoc, parseProjection } from './parse';
import { BordaServerQuery } from './query';

export type LiveQueryResponse<TSchema extends Document = Document> =
  | LiveQueryMessage<TSchema>
  | ChangeStreamUpdateDocument<TSchema>;

export function handleOn<TSchema extends Document = Document>({
  db,
  collection,
  event,
  filter,
  pipeline,
  projection,
  inspect,
  unlocked,
  cache,
  query,
  limit,
  skip,
  sort,
  options,
  include,
  exclude,
}: DocumentLiveQuery<TSchema> & {
  db: Db;
  unlocked: boolean;
  cache: Cache;
  query: (collection: string) => BordaServerQuery;
  inspect?: boolean;
}) {
  const docQuery: Omit<DocumentQuery, 'method'> = {
    filter: (filter ?? {}) as DocumentFilter,
    limit,
    skip,
    sort,
    projection,
    options,
    pipeline,
    include,
    exclude,
    collection,
  };

  const task = db.collection(collection);
  const stream = task.watch(
    [
      {
        $match: {
          operationType: {
            $in: [event === 'delete' ? 'update' : event], // because we do soft deletes by default
          },
        },
      },
      ...addFullDocumentPrefix([
        ...(!isEmpty(filter) ? [{ $match: filter }] : []),
        ...(pipeline ?? []),
      ]),
    ],
    {
      fullDocument: 'updateLookup',
    }
  );

  const disconnect = () => {
    stream.close();
    stream.removeAllListeners();
  };

  const source = new Observable<LiveQueryResponse<TSchema>>((observer) => {
    stream.on('error', (err) => {
      if (inspect) {
        console.log('LiveQueryMessage error', err);
      }
      observer.error(err);
      disconnect();
    });

    stream.on('close', () => {
      if (inspect) {
        console.log('LiveQueryMessage closed');
      }
      disconnect();
    });

    stream.on('init', () => {
      if (inspect) {
        console.log('LiveQueryMessage initialized');
      }
    });

    stream.on('change', async (change: ChangeStreamUpdateDocument<TSchema>) => {
      const { fullDocument, operationType, updateDescription } = change;
      const { updatedFields, removedFields, truncatedArrays } =
        updateDescription ?? {};

      let message: LiveQueryResponse<TSchema> =
        {} as LiveQueryResponse<TSchema>;

      /**
       * check if it's deleted
       */
      const isDeleted =
        event === 'delete' &&
        fullDocument &&
        fullDocument['_expires_at'] &&
        isDate(fullDocument['_expires_at']);

      if (isDeleted) {
        message = {
          doc: parseProjection(
            projection ?? {},
            await parseDoc<TSchema>({
              obj: fullDocument,
              inspect: inspect ?? false,
              isUnlocked: unlocked,
              cache,
              query,
            })(docQuery)
          ),
          docs: [],
        } as LiveQueryResponse<TSchema>;
      } else if (
        operationType === event &&
        ['insert', 'replace', 'update'].includes(operationType)
      ) {
        message = {
          doc: parseProjection(
            projection ?? {},
            await parseDoc<TSchema>({
              obj: fullDocument,
              inspect: inspect ?? false,
              isUnlocked: unlocked,
              cache,
              query,
            })(docQuery)
          ),
          docs: [],
          updatedFields: updatedFields ?? {},
          removedFields: removedFields ?? [],
          truncatedArrays,
        } as LiveQueryResponse<TSchema>;
      } else if (!['delete'].includes(operationType)) {
        if (operationType === event) {
          message = {
            ...change,
          };
        }
      }
      if (message) {
        observer.next(message);
      } else {
        observer.next({} as LiveQueryResponse<TSchema>);
      }
    });
  }).pipe(
    finalize(() => {
      disconnect();
    })
  );

  return source;
}

/**
 * behaves similiar to query.aggregate which is a stronger query.find
 * but here we have the advantage to traffic over the wire with websockets
 *
 * @param {DocumentLiveQuery} rawQuery
 * @param {WebSocket} ws
 */
export async function handleOnce(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  liveQuery: DocumentLiveQuery & {
    db: Db;
    unlocked: boolean;
    cache: Cache;
    query: (collection: string) => BordaServerQuery;
    inspect?: boolean;
  }
) {
  //   const docs: Document[] = [];
  //   const query = parseQuery(rawQuery);
  //   const {
  //     filter,
  //     limit,
  //     sort,
  //     projection,
  //     options,
  //     skip,
  //     pipeline,
  //     collection$,
  //   } = query;
  //   const cursor = collection$.aggregate<Document>(
  //     createPipeline<Document>({
  //       filter: filter ?? {},
  //       pipeline: pipeline ?? ([] as any),
  //       limit: limit ?? 10000,
  //       skip: skip ?? 0,
  //       sort: sort ?? {},
  //     }),
  //     options as AggregateOptions
  //   );
  //   for await (const doc of cursor) {
  //     docs.push(doc);
  //   }
  //   /**
  //    * send the message over the wire to the client
  //    */
  //   const message: LiveQueryMessage = {
  //     docs: parseProjection(
  //       projection ?? ({} as any),
  //       await parseDocs(docs)(query, EleganteServer.params, {})
  //     ),
  //     doc: null,
  //   };
  //   ws.send(JSON.stringify(message));
  //   /**
  //    * close connection
  //    */
  //   connections.delete(ws);
  //   ws.close();
}

/**
 * deal with realtime queries where we need to
 * prepend `fullDocument` to the field name
 * if it's not an operator ie: doesn't start with `$`
 */
export function addFullDocumentPrefix(obj: any | any[]) {
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
