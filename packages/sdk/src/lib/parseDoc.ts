/* eslint-disable @typescript-eslint/no-explicit-any */

import { ElegError, ErrorCode } from './ElegError';
import { ExternalFieldName, ExternalCollectionName } from './internal';
import { Document, DocumentQuery, query } from './query';

/**
 * we need to replicate the server params here
 * due to circular deps cause ServerParams lives in the server
 * and the server package depends on the sdk
 *
 * in this case let's just replicate the params we actually need
 */
interface ServerParams {
  joinCacheTTL?: number;
}

/**
 * memoize pointers
 */
const memo: {
  [key: string]: {
    data: any;
    expires: number;
  };
} = {};

/**
 * timer scheduler for cleaning up memo
 */
setInterval(() => {
  const now = Date.now();
  for (const key in memo) {
    const value = memo[key];
    if (now > value.expires) {
      delete memo[key];
    }
  }
}, 1000 * 1);

export function parseDocs<T extends Document[]>(
  arr: any[]
): (docQuery: DocumentQuery, params: ServerParams) => Promise<T[]> {
  return async (docQuery, params) => {
    for (let item of arr) {
      item = await parseDoc(parseResponse(item))(docQuery, params).catch(
        (err) => {
          throw new ElegError(ErrorCode.INVALID_DOCUMENT, err.message);
        }
      );
    }
    return Promise.resolve(arr as T[]);
  };
}

export function parseDoc<T extends Document>(
  obj: any
): (docQuery: DocumentQuery, params: ServerParams) => Promise<T> {
  return async (docQuery, params) => {
    await parsePointers(obj)(docQuery, params);
    return Promise.resolve(obj);
  };
}

export function parseResponse(obj: any) {
  for (let key in obj) {
    if (ExternalFieldName[key]) {
      obj[ExternalFieldName[key]] = obj[key];
      delete obj[key];
      key = ExternalFieldName[key];
    }
  }
  return obj;
}

export function parsePointers<T extends Document>(
  obj: any
): (docQuery: DocumentQuery, params: ServerParams) => Promise<T> {
  return async (docQuery, params) => {
    const { join } = docQuery;
    /**
     * create a tree structure out of join
     *
     * ie:
     * ['a', 'b', 'b.c', 'b.a', 'x.y.z']
     *
     * becomes:
     * {
     *    a: [],
     *    b: ['c', 'a'],
     *    x: ['y.z']
     * }
     *
     * then:
     * a, b, x are the pointer names (which should be mapped to the actual collection)
     * while their values are the new join paths to be requested
     */
    const tree = join.reduce((acc, item) => {
      const [key, ...rest] = item.split('.');
      const value = rest.join('.');
      if (acc[key]) {
        acc[key].push(value);
      } else {
        acc[key] = [value];
      }
      acc[key] = acc[key].filter((item) => item);
      return acc;
    }, {} as { [key: string]: string[] });

    /**
     * parse tree
     */
    for (const pointer in tree) {
      const p = obj[`_p_${pointer}`];
      const join = tree[pointer];

      if (typeof p === 'string' && p.includes('$')) {
        // console.log(pointer, p, Object.keys(memo));

        if (!memo[p]) {
          const explode = p.split('$');
          const collection = ExternalCollectionName[explode[0]] ?? explode[0];
          const objectId = explode[1];

          const doc = await query<T>()
            .collection(collection)
            .join(join)
            .filter({
              objectId: {
                $eq: objectId,
              },
            } as any)
            .findOne();

          if (!doc) continue;

          // remove raw _p_ entry
          delete obj[`_p_${pointer}`];

          // add pointer value
          obj[pointer] = parseResponse(doc);

          // memoize pointer value
          const timeout = params.joinCacheTTL ?? 1000;
          memo[p] = {
            data: obj[pointer],
            expires: Date.now() + timeout,
          };

          // console.log('no memo', memo[p].data['objectId']);
        } else {
          // reuse pointer value
          obj[pointer] = memo[p].data;

          // console.log('memo', memo[p].data['objectId']);
        }
      }
    }
    return Promise.resolve(obj);
  };
}
