/* eslint-disable @typescript-eslint/no-explicit-any */

import { DocumentQuery, log } from '@elegante/sdk';
import { ServerParams } from './Server';
import { createTree } from './parseInclude';

export function parseExclude<T extends Document>(
  obj: any
): (docQuery: DocumentQuery, params: ServerParams) => Promise<T> {
  return async (docQuery, params) => {
    const { exclude } = docQuery;

    /**
     * create a tree structure out of exclude
     * to delete the fields in the following format
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
     * a, b, x are the key names
     * while their values are the new exclude paths to be requested for deletion
     */
    const tree = createTree(exclude);

    log('exclude', exclude);
    log('tree', tree);

    /**
     * parse tree and delete the last level of keys
     */

    const parse = (obj: any, tree: { [key: string]: string[] }) => {
      for (const key in tree) {
        const treeValue = tree[key];
        if (treeValue.length) {
          parse(obj[key], createTree(tree[key]));
        } else {
          delete obj[key];
          log('excluded', key);
        }
      }
    };

    parse(obj, tree);

    return Promise.resolve(obj);
  };
}
