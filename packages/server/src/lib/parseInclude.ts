/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  DocumentQuery,
  isArrayPointer,
  isEmpty,
  isPointer,
  log,
  pointerObjectFrom,
  query,
} from '@elegante/sdk';

import { Cache } from './Cache';
import { ServerParams } from './Server';

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
    const tree = createTree(include ?? []);
    log('tree', tree);

    /**
     * parse tree
     */
    for (const pointerField in tree) {
      const pointerValue = obj[`_p_${pointerField}`] || obj[pointerField];

      log('pointerField', pointerField);
      log('pointerValue', pointerValue);
      log('isPointer', isPointer(pointerValue));

      if (isArrayPointer(pointerValue)) {
        for (let pointer of pointerValue) {
          const index = pointerValue.indexOf(pointer);
          pointer = await parseJoin(
            docQuery,
            params,
            locals,
            obj,
            tree,
            pointerField,
            pointer
          );
          pointerValue[index] = pointer;
        }
        continue;
      }

      if (!isPointer(pointerValue)) {
        continue;
      }

      const doc = await parseJoin(
        docQuery,
        params,
        locals,
        obj,
        tree,
        pointerField,
        pointerValue
      );

      // replace pointer with the actual document
      obj[pointerField] = doc;

      // remove raw _p_ entry
      delete obj[`_p_${pointerField}`];

      /**
       * this means the object may be populated in the first level
       * but we still need to keep trying to populate the next level
       */
      await parseJoinKeep(docQuery, params, locals, obj, tree, pointerField);
    }
    return Promise.resolve(obj);
  };
}

export async function parseJoin<T extends Document>(
  docQuery: DocumentQuery,
  params: ServerParams,
  locals: any,
  obj: any,
  tree: { [key: string]: string[] },
  pointerField: string,
  pointerValue: any
) {
  let doc;

  const join = tree[pointerField];
  const { collection, objectId } = pointerObjectFrom(pointerValue);
  const memo = Cache.get(collection, objectId);

  if (memo) {
    doc = memo;
  } else {
    doc = await query<T>(collection)
      .include(join)
      .unlock() // here we force unlock because `parseInclude` run in the server anyways 💁‍♂️
      .findOne(objectId);

    // memoize
    if (!isEmpty(doc)) {
      Cache.set(collection, objectId, doc);
    }
  }
  return doc;
}

export async function parseJoinKeep(
  docQuery: DocumentQuery,
  params: ServerParams,
  locals: any,
  obj: any,
  tree: { [key: string]: string[] },
  pointerField: string
) {
  for (const pointerTreeField of tree[pointerField]) {
    const pointerTreeBase = pointerTreeField.split('.')[0];

    log('pointerTreeField', pointerTreeField);
    log('pointerTreeBase', pointerTreeBase);

    await parseInclude(obj[pointerField])(
      { ...docQuery, include: [pointerTreeField] },
      params,
      locals
    );
  }
}

export function createTree(arr: string[]) {
  return (
    arr.reduce((acc, item) => {
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
