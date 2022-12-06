import { InternalCollectionName } from './internal';
import { ExternalCollectionName } from './external';

import { Document } from './types/query';

/**
 * A string representation of a pointer
 * which is a reference to another document
 *
 * @export
 * @interface Pointer
 */
export type Pointer = string;

export function pointer<T = Document>(collection: string, objectId: string): T {
  return `${InternalCollectionName[collection] ?? collection}$${objectId}` as T;
}

export function getPointer(value: string) {
  const explode = value.split('$');
  const collection = ExternalCollectionName[explode[0]] ?? explode[0];
  const objectId = explode[1];
  return {
    collection,
    objectId,
  };
}
