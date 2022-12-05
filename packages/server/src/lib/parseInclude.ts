/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  DocumentQuery,
  getPointer,
  isPointer,
  log,
  query,
} from '@elegante/sdk';
import { ServerParams } from './EleganteServer';

/**
 * memoize pointers
 */
const useMemo = true;
type Memo = Map<
  string,
  {
    data: any;
    expires: number;
  }
>;
export const memo: Memo = new Map();

/**
 * scheduler for cleaning up memo
 */
setInterval(() => {
  const now = Date.now();
  for (const key in memo) {
    const value = memo.get(key);
    if (value && now > value.expires) {
      log('removing memo', key);
      memo.delete(key);
    }
  }
}, 1000 * 1);

export function parseInclude<T extends Document>(
  obj: any
): (docQuery: DocumentQuery, params: ServerParams, locals: any) => Promise<T> {
  return async (docQuery, params, locals) => {
    const { include } = docQuery;
    /**
     * create a tree structure out of include
     * to join the pointers in the following format
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
    const tree = createTree(include);
    log('tree', tree);

    /**
     * parse tree
     */
    for (const pointerField in tree) {
      const pointerValue = obj[`_p_${pointerField}`] || obj[pointerField];

      log('pointerField', pointerField);
      log('pointerValue', pointerValue);
      log('isPointer', isPointer(pointerValue));

      if (!isPointer(pointerValue)) {
        /**
         * this means the object may be already populated
         * ie: aggregation or memoization
         * so we need to continue in the next tree level
         */
        for (const pointerTreeField of tree[pointerField]) {
          const pointerTreeBase = pointerTreeField.split('.')[0];

          log('pointerTreeField', pointerTreeField);
          log('pointerTreeBase', pointerTreeBase);

          await parseInclude(obj[`${pointerField}`])(
            { ...docQuery, include: [pointerTreeField] },
            params,
            locals
          );
        }
        continue;
      }

      const join = tree[pointerField];

      if (!memo.get(pointerValue) || !useMemo) {
        const { collection, objectId } = getPointer(pointerValue);

        const doc = await query<T>(collection)
          .include(join)
          .unlock(true) // here we force unlock because `parseInclude` run in the server anyways 💁‍♂️
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
        const timeout = params.includeCacheTTL;

        if (timeout > 0) {
          memo.set(pointerValue, {
            data: obj[pointerField],
            expires: Date.now() + timeout,
          });
          log(
            'pointerValue',
            'no memo',
            memo.get(pointerValue)?.data['objectId']
          );
        }
      }

      if (memo.get(pointerValue) && useMemo) {
        // reuse pointer value
        obj[pointerField] = memo.get(pointerValue)?.data;

        // remove raw _p_ entry
        delete obj[`_p_${pointerField}`];

        log(
          'pointerValue',
          'memoized',
          memo.get(pointerValue)?.data['objectId']
        );
      }
    }
    return Promise.resolve(obj);
  };
}

export function createTree(arr: string[] | undefined) {
  return (
    arr?.reduce((acc, item) => {
      const [key, ...rest] = item.split('.');
      const value = rest.join('.');
      if (acc[key]) {
        acc[key].push(value);
      } else {
        acc[key] = [value];
      }
      acc[key] = acc[key].filter((item) => item);
      return acc;
    }, {} as { [key: string]: string[] }) ?? {}
  );
}
