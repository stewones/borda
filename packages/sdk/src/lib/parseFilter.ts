import { FilterOperations } from './query';
import { isISODate } from './utils';
import { Document } from './query';

export function parseFilter<T = Document>(obj: {
  [key: string]: FilterOperations<T>;
}) {
  if (!obj) return null;
  for (const key in obj) {
    for (const filter in obj[key]) {
      const value = obj[key][filter];
      /**
       * checks if value is a valid iso date
       * and convert to Date as it's required by mongo
       */
      if (isISODate(value)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        obj[key][filter] = new Date(value) as any;
      }
    }
  }
  return obj;
}
