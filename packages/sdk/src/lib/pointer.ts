import { InternalCollectionName } from './internal';
import { Document } from './query';

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
