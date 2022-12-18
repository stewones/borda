/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  EleganteError,
  ErrorCode,
  InternalFieldName,
  isISODate,
  isPointer,
  isServer,
} from '@elegante/sdk';

export function parseFilter(obj: any | any[]): any | any[] {
  if (!isServer())
    throw new EleganteError(
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
        const value = obj[field];

        if (typeof value === 'string' && !field.startsWith('_p_')) {
          if (isPointer(value)) {
            obj['_p_' + field] = value;
            delete obj[field];
          }
        } else {
          if (!field.startsWith('_p_')) {
            const operation = obj[field];
            for (let op in operation) {
              const value = operation[op];
              if (isPointer(value) && !field.startsWith('$')) {
                obj['_p_' + field] = operation;
                delete obj[field];
              }

              /**
               * format internal keys
               * createdAt -> _created_at
               */
              if (InternalFieldName[op]) {
                operation[InternalFieldName[op]] = operation[op];
                delete operation[op];
                op = InternalFieldName[op];
              }

              /**
               * keep parsing
               */
              parseFilter(operation[op]);
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
