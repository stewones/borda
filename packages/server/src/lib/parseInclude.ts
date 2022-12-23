/**
 * @license
 * Copyright Intenseloop LTD All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  DocumentQuery,
  pointerObjectFrom,
  isPointer,
  log,
  query,
} from '@elegante/sdk';

import { ServerParams } from './Server';
import { Cache } from './Cache';

export function parseInclude<T extends Document>(
  obj: any
): (docQuery: DocumentQuery, params: ServerParams, locals: any) => Promise<T> {
  return async (docQuery, params, locals) => {
    if (!obj) return {};
    const { include } = docQuery;
    /**
     * create a tree structure out of include
     * to recursively join the pointers in the following format
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
     * a, b, x becomes the pointer names (which should be mapped to the actual collection)
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
      const { collection, objectId } = pointerObjectFrom(pointerValue);

      const memo = Cache.get(collection, objectId);

      if (memo) {
        // reuse pointer value
        obj[pointerField] = memo;

        // remove raw _p_ entry
        delete obj[`_p_${pointerField}`];
      } else {
        const doc = await query<T>(collection)
          .include(join)
          .unlock() // here we force unlock because `parseInclude` run in the server anyways 💁‍♂️
          .findOne(objectId);

        if (!doc) continue;

        // remove raw _p_ entry
        delete obj[`_p_${pointerField}`];

        // add pointer value
        obj[pointerField] = doc;

        // memoize
        Cache.set(collection, objectId, obj[pointerField]);
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
