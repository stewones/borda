/* eslint-disable @typescript-eslint/no-explicit-any */
import { isISODate } from './utils';
import { InternalFieldName } from './internal';

export function parseFilter(obj: any) {
  for (let key in obj) {
    for (const filter in obj[key]) {
      const value: any = obj[key][filter];

      /**
       * format internal keys
       */
      if (InternalFieldName[key]) {
        obj[InternalFieldName[key]] = obj[key];
        delete obj[key];
        key = InternalFieldName[key];
      }

      /**
       * checks if value is a valid iso date
       * and convert to Date as it's required by mongo
       */
      if (isISODate(value)) {
        obj[key][filter] = new Date(value) as any;
      }
    }
  }

  return obj;
}
