/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { Application } from 'express';
import {
  Db,
  MongoClient,
} from 'mongodb';

import {
  Document,
  DocumentPipeline,
  EleganteError,
  ElegantePlugin,
  ErrorCode,
  Filter,
  FindOptions,
  isEmpty,
  pointer,
  print,
  query,
  Sort,
} from '@elegante/sdk';

import { invalidateCache } from './Cache';
import { DocQRL } from './parseQuery';

interface ServerProtocol {
  params: ServerParams;
  app: Application;
  db: Db;
}

export interface ServerParams {
  debug?: boolean;
  databaseURI: string;
  apiKey: string;
  apiSecret: string;
  serverURL: string;
  serverHeaderPrefix?: string;
  plugins?: ElegantePlugin[];
  liveQueryServerURL?: string;
  /**
   * Default to 1h for document time-to-live.
   * it means that some internal queries will hit memory and be invalidated on every hour.
   * _unless_ related docs are updated/deleted in the database, in this case cache is invalidated right away.
   */
  documentCacheTTL?: number;
  /**
   * when the `query.limit(...)` is not set, this setting will be applied.
   * to deactivate this setting, just set `query.unlock()` in your query
   * please note that unlocking queries is only available in the server-side.
   *
   * Default to 50 docs per query
   */
  queryMaxDocLimit?: number;
  poweredBy?: string;
}

export const ServerDefaultParams: Partial<ServerParams> = {
  serverHeaderPrefix: 'X-Elegante',
  documentCacheTTL: 1000 * 60 * 60,
  queryMaxDocLimit: 50,
};

export const EleganteServer: ServerProtocol = {
  app: {} as Application,
  db: {} as Db,
  params: {
    ...ServerDefaultParams,
  },
} as ServerProtocol;

export function logInspection(docQRL: DocQRL) {
  const { locals } = docQRL.res || {};

  const { inspect } = locals || {};
  if (!inspect) return;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { collection$, res, ...rest } = docQRL;
  print('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~');
  print('~~~~~~~~ QUERY INSPECTION ~~~~~~~~~');
  print('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~');
  print(JSON.stringify(rest, null, 2));
}

export async function mongoConnect({ params }: { params: ServerParams }) {
  try {
    const client = new MongoClient(params.databaseURI);
    await client.connect();
    return client.db();
  } catch (err) {
    return Promise.reject(
      new EleganteError(ErrorCode.DATABASE_CONNECTION_FAILED, err as object)
    );
  }
}

export async function createIndexes({
  db,
  params,
}: {
  db: Db;
  params: ServerParams;
}) {
  try {
    const collections = db.listCollections();
    const collectionsArray = await collections.toArray();
    for (const collection of collectionsArray) {
      if (
        collection.type === 'collection' &&
        !collection.name.startsWith('system.')
      ) {
        /**
         * Create `_expires_at` index used for soft deletes.
         * We don't actually delete a document, we update its _expires_at field with the current `Date`.
         * Then mongo will automatically delete this document once the TTL is reached.
         * Project-wide we should never directly delete a document if we want to keep its reference.
         * The reasoning is due to hooks like `afterDelete` where we need the document to be available for linking it back to the user.
         */
        await db
          .collection(collection.name)
          .createIndex({ _expires_at: 1 }, { expireAfterSeconds: 0 });
      }
    }
  } catch (err) {
    throw new EleganteError(
      ErrorCode.SERVER_INDEX_CREATION_FAILED,
      err as unknown as any
    );
  }
}

export async function ensureCacheInvalidation(db: Db) {
  if (!EleganteServer.params.documentCacheTTL) return;
  const collections = db.listCollections();
  const collectionsArray = await collections.toArray();
  for (const collectionInfo of collectionsArray) {
    if (
      collectionInfo.type === 'collection' &&
      !collectionInfo.name.startsWith('system.')
    ) {
      /**
       * listen to collection changes so we can invalidate the memoized queries
       */
      const collection = EleganteServer.db.collection(collectionInfo.name);
      collection
        .watch(
          [
            {
              $match: {
                operationType: {
                  $in: ['update'],
                },
              },
            },
          ],
          collectionInfo.name === '_Session'
            ? {
                fullDocument: 'updateLookup',
              }
            : {}
        )
        .on('change', (change) => {
          const { documentKey, fullDocument }: any = change;
          const { _id } = documentKey;
          if (collectionInfo.name === '_Session') {
            invalidateCache(collectionInfo.name, fullDocument);
          } else {
            invalidateCache(collectionInfo.name, { _id });
          }
        });
    }
  }
}

export async function ensureSessionInvalidation(db: Db) {
  /**
   * listen to user deletions to invalidate all user sessions
   */
  const collection = db.collection('_User');
  collection
    .watch(
      [
        {
          $match: {
            $or: [
              {
                operationType: {
                  $in: ['delete'],
                },
              },
              {
                operationType: {
                  $in: ['update'],
                },
                'fullDocument._expires_at': {
                  $exists: true,
                },
              },
            ],
          },
        },
      ],
      {
        fullDocument: 'updateLookup',
      }
    )
    .on('change', (change) => {
      const { documentKey }: any = change;
      const { _id } = documentKey;

      query('Session')
        .unlock()
        .filter({
          user: pointer('User', _id),
        })
        .delete()
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .catch((_err) => {
          // it's fine if the session is already deleted or doesn't exist
        });
    });
}

export function createFindCursor<T extends Document>(docQRL: DocQRL) {
  const { collection$, options, filter, sort, limit, skip } = docQRL;
  const { allowDiskUse } = (options as FindOptions) || {};

  const cursor = collection$.find<T>(filter || ({} as any), {
    sort,
    ...options,
  });

  if (allowDiskUse) {
    cursor.allowDiskUse(true);
  }

  if (limit) {
    cursor.limit(limit);
  }

  if (skip) {
    cursor.skip(skip);
  }

  return cursor;
}

export function createPipeline<TSchema = Document>(bridge: {
  filter: Filter<TSchema>;
  pipeline?: DocumentPipeline<TSchema>;
  sort?: Sort;
  limit?: number;
  skip?: number;
}) {
  const { filter, pipeline, sort, limit, skip } = bridge;
  return [
    ...(!isEmpty(filter) ? [{ $match: filter }] : []),
    ...(pipeline ?? []),
    ...(!isEmpty(sort) ? [{ $sort: sort }] : []),
    ...(typeof limit === 'number' ? [{ $limit: limit }] : []),
    ...(typeof skip === 'number' ? [{ $skip: skip }] : []),
  ];
}
