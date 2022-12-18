import { InternalCollectionName } from './internal';
import { ExternalCollectionName } from './external';
import { Document } from './types/query';
import { isPointer } from './utils';
import { EleganteError, ErrorCode } from './Error';

/**
 * A string representation of a pointer
 * which is a reference to another document
 *
 * @export
 * @interface Pointer
 */
export type Pointer = string;

export function pointer<T = Document>(
  collection: string,
  object?: string | Document
): T {
  if (object && typeof object === 'string' && isPointer(object)) {
    return object as T;
  }

  if (object && typeof object === 'string' && !isPointer(object)) {
    return `${InternalCollectionName[collection] ?? collection}$${object}` as T;
  }

  if (object && typeof object === 'object' && object['objectId']) {
    return pointer(collection, object['objectId']);
  }

  throw new EleganteError(ErrorCode.INVALID_DOCUMENT, 'Invalid pointer');
}

export function pointerObjectFrom(value: string) {
  const explode = value.split('$');
  const collection = ExternalCollectionName[explode[0]] ?? explode[0];
  const objectId = explode[1];
  return {
    collection,
    objectId,
  };
}
