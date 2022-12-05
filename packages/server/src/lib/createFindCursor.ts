import { InternalFieldName } from '@elegante/sdk';
import { Document } from 'mongodb';
import { parseFilter } from './parseFilter';
import { DocQRL } from './parseQuery';

export function createFindCursor<T extends Document>(docQRL: DocQRL) {
  const { collection$, options, filter, sort, projection, limit, skip } =
    docQRL;

  const { allowDiskUse } = options || {};

  /**
   * decode sort
   */
  for (const fieldName in sort) {
    if (InternalFieldName[fieldName]) {
      sort[InternalFieldName[fieldName]] = sort[fieldName];
      delete sort[fieldName];
    }
  }

  const cursor = collection$.find<T>(parseFilter(filter), {
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
