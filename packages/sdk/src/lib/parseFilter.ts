/* eslint-disable @typescript-eslint/no-explicit-any */
import { isISODate, isServer } from './utils';
import { InternalFieldName } from './internal';
import { ElegError, ErrorCode } from './ElegError';

export function parseFilter(obj: any) {
  if (!isServer())
    throw new ElegError(
      ErrorCode.FILTER_ONLY_SERVER,
      'we should only parse filters in the server'
    );

  for (let field in obj) {
    for (const filter in obj[field]) {
      const value: any = obj[field][filter];

      /**
       * format internal keys
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
      if (isISODate(value)) {
        obj[field][filter] = new Date(value) as any;
      }

      if (typeof value === 'object') {
        obj[field][filter] = parseFilter(value);
      }
    }

    /**
     * cover pointer cases
     * fieldName -> _p_fieldName
     *
     * cursor.filter(
     *  { fieldName: { $eq: 'Collection$objectId' } }
     * )
     */
    if (!field.startsWith('_p_')) {
      const operation = obj[field];
      for (const op in operation) {
        const value = operation[op];
        if (typeof value === 'string' && value.includes('$')) {
          obj['_p_' + field] = operation;
          delete obj[field];
        }
      }
    }
  }

  return obj;
}
