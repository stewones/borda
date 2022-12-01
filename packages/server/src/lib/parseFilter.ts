/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  ElegError,
  ErrorCode,
  InternalFieldName,
  isISODate,
  isPointer,
  isServer,
} from '@elegante/sdk';

export function parseFilter(obj: any | any[]): any | any[] {
  if (!isServer())
    throw new ElegError(
      ErrorCode.FILTER_ONLY_SERVER,
      'we should only parse filters in the server'
    );

  if (Array.isArray(obj) && obj.every((item) => typeof item === 'object')) {
    for (let i = 0; i < obj.length; i++) {
      obj[i] = parseFilter(obj[i]);
    }
  }

  if (!Array.isArray(obj) && typeof obj === 'object') {
    for (let field in obj) {
      if (typeof obj[field] === 'object') {
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
         * cover pointer cases
         * fieldName -> _p_fieldName
         *
         * cursor.filter(
         *  { _p_fieldName: { $eq: 'Collection$objectId' } }
         * )
         */
        if (!field.startsWith('_p_')) {
          const operation = obj[field];
          for (const op in operation) {
            const value = operation[op];
            if (isPointer(value)) {
              obj['_p_' + field] = operation;
              delete obj[field];
            }
          }
        }

        /**
         * keep parsing
         */
        parseFilter(obj[field]);
      } else {
        const value: any = obj[field];
        /**
         * checks if value is a valid iso date
         * and convert to Date as it's required by mongo
         */
        if (typeof value === 'string' && isISODate(value)) {
          obj[field] = new Date(value) as any;
        }
      }
    }
  }

  return obj;
}
