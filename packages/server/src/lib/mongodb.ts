import {
  Db,
  Filter,
  FindOptions,
  MongoClient,
  Sort,
} from 'mongodb';

import {
  BordaError,
  DocumentPipeline,
  ErrorCode,
  isEmpty,
} from '@borda/sdk';

import { DocQRL } from './parse';

export async function mongoConnect({ mongoURI }: { mongoURI: string }) {
  try {
    const client = new MongoClient(mongoURI);
    await client.connect();
    return client.db();
  } catch (err) {
    throw new BordaError(ErrorCode.DATABASE_CONNECTION_FAILED, err as object);
  }
}

export async function mongoCreateIndexes({ db }: { db: Db }) {
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

        // check if index exists first
        const indexes = await db.collection(collection.name).indexes();
        const indexExists = indexes.find(
          (index) => index.name === '_expires_at_1'
        );
        if (indexExists) {
          continue;
        }

        const indexResult = await db
          .collection(collection.name)
          .createIndex({ _expires_at: 1 }, { expireAfterSeconds: 0 });

        console.log(
          `💽 Index created for collection ${collection.name}`,
          indexResult
        );
      }
    }
  } catch (err) {
    throw new BordaError(
      ErrorCode.SERVER_INDEX_CREATION_FAILED,
      err as unknown as Error
    );
  }
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

export function createPipeline<TSchema extends Document = Document>(bridge: {
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
  ] as unknown as DocumentPipeline<TSchema>;
}

export function queryHasMongoOperators(doc: any): boolean {
  if (typeof doc !== 'object' || doc === null) {
    return false;
  }

  for (const key in doc) {
    if (key.startsWith('$')) {
      return true;
    }

    if (typeof doc[key] === 'object' && doc[key] !== null) {
      const hasOperator = hasMongoOperators(doc[key]);
      if (hasOperator) {
        return true;
      }
    }

    if (Array.isArray(doc[key])) {
      for (const item of doc[key]) {
        if (typeof item === 'object' && item !== null) {
          const hasOperator = hasMongoOperators(item);
          if (hasOperator) {
            return true;
          }
        }
      }
    }
  }

  return false;
}
