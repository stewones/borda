import { FilterOperations, FindOptions, Sort } from '@elegante/sdk';
import { Collection, Document } from 'mongodb';
import { parseFilter } from './parseFilter';

export function createCursor<T extends Document>(from: {
  collection: Collection<Document>;
  options: FindOptions | undefined;
  filter: FilterOperations<T> | undefined;
  sort: Sort;
  projection: T | undefined;
  limit: number;
  skip: number;
}) {
  const { collection, options, filter, sort, projection, limit, skip } = from;
  const { allowDiskUse } = options || {};

  const cursor = collection.find<Document>(parseFilter(filter), {
    sort,
    projection,
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
