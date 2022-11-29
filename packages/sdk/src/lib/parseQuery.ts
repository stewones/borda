/* eslint-disable @typescript-eslint/no-explicit-any */

import { FilterOperations } from './query';
import { isISODate } from './utils';

export function parseQuery<T = any>(obj: {
  [key: string]: FilterOperations<T>;
}) {
  if (!obj) return null;
  for (const key in obj) {
    for (const filter in obj[key]) {
      if (['$gt', '$lt', '$gte', '$lte'].includes(filter)) {
        const value = obj[key][filter];
        // checks if value is a valid iso date
        // and convert to Date as it's required by mongo
        if (isISODate(value)) {
          obj[key][filter] = new Date(value) as any;
        }
      }
    }
  }
  return obj;
}
