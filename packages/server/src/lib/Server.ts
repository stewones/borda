/* eslint-disable @typescript-eslint/no-explicit-any */
import { Application } from 'express';
import { Db, MongoClient } from 'mongodb';

import {
  EleganteError,
  ErrorCode,
  isEmpty,
  Filter,
  Sort,
  Document,
  ElegantePlugin,
} from '@elegante/sdk';

import { InternalFieldName } from '@elegante/sdk';
import { parseFilter } from './parseFilter';
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
   * *unless* related docs are updated/deleted in the database, then its cache is invalidated immediately.
   * this is so we don't need to be accessing database every time we need to get a document.
   */
  documentCacheTTL?: number;
}

export const ServerDefaultParams: Partial<ServerParams> = {
  serverHeaderPrefix: 'X-Elegante',
  documentCacheTTL: 1000 * 60 * 60,
};

export const EleganteServer: ServerProtocol = {
  app: {} as Application,
  db: {} as Db,
  params: {
    ...ServerDefaultParams,
  },
} as ServerProtocol;

export async function mongoConnect({ params }: { params: ServerParams }) {
  try {
    const client = new MongoClient(params.databaseURI);
    await client.connect();
    return client.db();
  } catch (err) {
    return Promise.reject(
      new EleganteError(ErrorCode.CONNECTION_FAILED, err as object)
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
         * create _expires_at index used for internal soft deletes
         * ie: we don't actually delete the document, we just set _expires_at to a new Date() object
         * representing the TTL. Then mongo will automatically delete the document after the TTL expires
         * so project-wide, we should never directly delete a documentif we want to keep a record of it. ie: hooks like afterDelete
         */
        await db
          .collection(collection.name)
          .createIndex({ _expires_at: 1 }, { expireAfterSeconds: 0 });
      }
    }
  } catch (err) {
    throw new EleganteError(
      ErrorCode.INDEX_CREATION_FAILED,
      `Elegante couldn't create indexes on startup`
    );
  }
}

export function createFindCursor<T extends Document>(docQRL: DocQRL) {
  const { collection$, options, filter, sort, projection, limit, skip } =
    docQRL;

  const { allowDiskUse } = options || {};

  /**
   * decode sort
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sortAny: any = sort;
  for (const fieldName in sortAny) {
    if (InternalFieldName[fieldName]) {
      sortAny[InternalFieldName[fieldName]] = sortAny[fieldName];
      delete sortAny[fieldName];
    }
  }

  const cursor = collection$.find<T>(parseFilter(filter), {
    projection,
    sort: sortAny,
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

/**
 * allowed operators for watch (query.on())
 * see https://www.mongodb.com/docs/manual/reference/method/Mongo.watch/#mongodb-method-Mongo.watch
 *
 * @export
 * @template TSchema
 * @param {{
 *   filter: Filter<TSchema>;
 *   pipeline: Document[];
 *   projection: Partial<{
 *     [key in keyof TSchema]: number;
 *   }>;
 *   sort?: Sort;
 *   limit?: number;
 *   skip?: number;
 * }} bridge
 * @returns {*}
 */
export function createPipeline<TSchema>(bridge: {
  filter: Filter<TSchema>;
  pipeline?: Document[] | undefined;
  projection: Partial<{
    [key in keyof TSchema]: number;
  }>;
  sort?: Sort;
  limit?: number;
  skip?: number;
}) {
  const { filter, pipeline, sort, projection, limit, skip } = bridge;
  return [
    ...(!isEmpty(filter) ? [{ $match: parseFilter(filter) }] : []),
    ...parseFilter(pipeline ?? []),
    ...(!isEmpty(sort) ? [{ $sort: sort }] : []),
    ...(!isEmpty(projection) ? [{ $project: projection }] : []),
    ...(typeof limit === 'number' ? [{ $limit: limit }] : []),
    ...(typeof skip === 'number' ? [{ $skip: skip }] : []),
  ];
}
