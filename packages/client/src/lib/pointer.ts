/**
 * @license
 * Copyright Borda All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://borda.dev/license
 */

import { BordaError, ErrorCode } from './Error';
import { ExternalCollectionName } from './external';
import { InternalCollectionName } from './internal';
import { Document } from './types/query';
import { isPointer } from './utils';

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

  console.trace(
    `Invalid pointer (${JSON.stringify(object)}) for collection ${collection}`
  );

  throw new BordaError(ErrorCode.QUERY_INVALID_POINTER, 'Invalid pointer');
}

export function pointerObjectFrom(value: string) {
  if (!isPointer(value)) {
    console.trace(`Invalid pointer (${value})`);
    throw new BordaError(
      ErrorCode.QUERY_INVALID_POINTER,
      'Invalid string pointer'
    );
  }
  const explode = value.split('$');
  const collection = ExternalCollectionName[explode[0]] ?? explode[0];
  const objectId = explode[1];
  return {
    collection,
    objectId,
  };
}
