/* eslint-disable @typescript-eslint/no-explicit-any */

import { DocumentQuery } from '@elegante/sdk';
import { ServerParams } from './ElegServer';

export function parseExclude<T extends Document>(
  obj: any
): (docQuery: DocumentQuery, params: ServerParams) => Promise<T> {
  return async (docQuery, params) => {
    const { exclude } = docQuery;
    /**
     * delete properties from the object based on the exclude array
     * which is a list of paths to be excluded in the following format
     *
     * ['a', 'b', 'b.c', 'b.a', 'x.y.z']
     */

    for (const item of exclude) {
      const [key, ...rest] = item.split('.');
      const value = rest.join('.');
      if (obj[`_p_${key}`] || obj[key]) {
        if (value) {
          await parseExclude(obj[key])(docQuery, params);
        } else {
          delete obj[key];
          delete obj[`_p_${key}`];
        }
      }
    }

    return Promise.resolve(obj);
  };
}
