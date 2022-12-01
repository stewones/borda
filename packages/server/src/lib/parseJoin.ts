/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  DocumentQuery,
  ExternalCollectionName,
  getPointer,
  isPointer,
  query,
} from '@elegante/sdk';
import { ServerParams } from './ElegServer';

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
 * scheduler for cleaning up memo
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

export function parseJoin<T extends Document>(
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
    for (const pointerField in tree) {
      const pointerValue = obj[`_p_${pointerField}`];
      if (!isPointer(pointerValue)) {
        /**
         * this means the object may be already resolved
         * ie: aggregation or something else
         *
         * so we need to fetch every pointer in the tree for that object
         */
        for (const pointerTreeField of tree[pointerField]) {
          const pointerTreeBase = pointerTreeField.split('.')[0];
          const pointerTreeValue = obj[`_p_${pointerTreeBase}`];

          console.log('pointerTreeField', pointerTreeField);
          console.log('pointerTreeBase', pointerTreeBase);
          console.log('pointerTreeValue', pointerTreeValue);

          if (isPointer(pointerTreeValue)) {
            await parseJoin(obj[`${pointerField}`])(
              { ...docQuery, join: [pointerTreeField] },
              params
            );
          }
        }
        continue;
      }

      const join = tree[pointerField];

      if (!memo[pointerValue]) {
        const { collection, objectId } = getPointer(pointerValue);

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
        delete obj[`_p_${pointerField}`];

        // add pointer value
        obj[pointerField] = doc;

        // memoize pointer value
        const timeout = params.joinCacheTTL ?? 1000;
        memo[pointerValue] = {
          data: obj[pointerField],
          expires: Date.now() + timeout,
        };

        console.log('no memo', memo[pointerValue].data['objectId']);
      } else {
        // reuse pointer value
        obj[pointerField] = memo[pointerValue].data;

        // remove raw _p_ entry
        delete obj[`_p_${pointerField}`];

        console.log('memo', memo[pointerValue].data['objectId']);
      }
    }
    return Promise.resolve(obj);
  };
}
