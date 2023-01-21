/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  EleganteError,
  ErrorCode,
  InternalFieldName,
  isISODate,
  isPointer,
  isServer,
} from '@elegante/sdk';

/**
 * used to parse queries by `filter` or `pipeline`
 */
export function parseFilter(obj: any | any[]): any | any[] {
  if (!isServer())
    throw new EleganteError(
      ErrorCode.QUERY_FILTER_SERVER_ONLY,
      'we should only parse filters in the server'
    );

  if (Array.isArray(obj) && obj.every((item) => typeof item === 'object')) {
    for (let i = 0; i < obj.length; i++) {
      obj[i] = parseFilter(obj[i]);
    }
  }

  if (!Array.isArray(obj) && typeof obj === 'object') {
    for (let field in obj) {
      const value: any = obj[field];

      /**
       * format internal keys
       * createdAt -> _created_at
       */
      if (InternalFieldName[field]) {
        obj[InternalFieldName[field]] = obj[field];
        delete obj[field];
        field = InternalFieldName[field];
      }

      /**
       * checks if value is a valid iso date
       * and convert to Date as it's required by mongo
       */
      if (typeof value === 'string' && isISODate(value)) {
        obj[field] = new Date(value) as any;
      }

      /**
       * deal with pointers
       * {
       *   fieldName: 'Collection$objectId'
       * }
       */
      if (
        !field.startsWith('$') &&
        !field.startsWith('_p_') &&
        isPointer(value)
      ) {
        obj['_p_' + field] = value;
        delete obj[field];
      }

      /**
       * deal with pointers
       * {
       *   fieldName: {
       *     $eq: 'Collection$objectId'
       *   }
       * }
       */
      if (
        !field.startsWith('$') &&
        !field.startsWith('_p_') &&
        typeof value === 'object'
      ) {
        let foundPointer = false;
        for (const operator in value) {
          if (operator.startsWith('$') && isPointer(value[operator])) {
            foundPointer = true;
          }
        }
        if (foundPointer) {
          obj['_p_' + field] = value;
          delete obj[field];
        }
      }

      /**
       * deal with empty $and and $or
       */
      if (['$and', '$or'].includes(field)) {
        if (Array.isArray(value) && !value.length) {
          delete obj[field];
        }
      }

      /**
       * keep parsing
       */
      if (typeof obj[field] === 'object') {
        parseFilter(obj[field]);
      }
    }
  }

  return obj;
}
