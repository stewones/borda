/**
 * @license
 * Copyright Borda All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://borda.dev/license
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { ChangeStreamUpdateDocument, Db, Document } from 'mongodb';
import { Subject } from 'rxjs';

import {
  AggregateOptions,
  DocumentFilter,
  DocumentLiveQuery,
  DocumentQuery,
  isDate,
  isEmpty,
  LiveQueryMessage,
} from '@borda/client';

import { Cache } from './Cache';
import { createPipeline } from './mongodb';
import { parseDoc, parseDocs, parseProjection, parseQuery } from './parse';
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
}): {
  disconnect: () => void;
  onChanges: Subject<LiveQueryMessage<TSchema>>;
  onError: Subject<Error>;
} {
  const onChanges = new Subject<LiveQueryMessage<TSchema>>();
  const onError = new Subject<Error>();

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

  stream.on('error', (err) => {
    if (inspect) {
      console.log('LiveQueryMessage error', err);
    }

    onError.next(err);
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

    let message: LiveQueryMessage<TSchema> = {} as LiveQueryMessage<TSchema>;

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
      } as LiveQueryMessage<TSchema>;
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
      } as LiveQueryMessage<TSchema>;
    } else if (!['delete'].includes(operationType)) {
      if (operationType === event) {
        message = {
          ...change,
        } as unknown as LiveQueryMessage<TSchema>;
      }
    }

    if (message) {
      onChanges.next(message);
    } else {
      onChanges.next({} as LiveQueryMessage<TSchema>);
    }
  });

  return {
    disconnect,
    onChanges,
    onError,
  };
}

/**
 * behaves similiar to query.aggregate which is a stronger query.find
 * but here we have the advantage to traffic over the wire with websockets
 *
 * @param {DocumentLiveQuery} rawQuery
 * @param {WebSocket} ws
 */
export async function handleOnce<TSchema extends Document = Document>(
  liveQuery: DocumentLiveQuery<TSchema> & {
    db: Db;
    unlocked: boolean;
    cache: Cache;
    query: (collection: string) => BordaServerQuery;
    inspect?: boolean;
  }
) {
  const docs: TSchema[] = [];
  const docQuery = parseQuery({
    from: liveQuery,
    db: liveQuery.db,
    inspect: liveQuery.inspect ?? false,
  });

  const {
    filter,
    limit,
    sort,
    projection,
    options,
    skip,
    pipeline,
    collection$,
  } = docQuery;

  const cursor = collection$.aggregate<TSchema>(
    createPipeline<TSchema>({
      filter: filter ?? ({} as any),
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

  const message: LiveQueryMessage<TSchema> = {
    docs: parseProjection(
      projection ?? ({} as any),
      await parseDocs({
        arr: docs,
        inspect: liveQuery.inspect ?? false,
        isUnlocked: liveQuery.unlocked,
        cache: liveQuery.cache,
        query: liveQuery.query,
      })(docQuery)
    ),
  } as LiveQueryMessage<TSchema>;

  return message;
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
