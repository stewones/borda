/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * compare two objects and output the updated fields
 *
 * @export
 * @param {*} before
 * @param {*} after
 * @returns {*}  {*}
 */
export function objectFieldsUpdated(before: any, after: any): any {
  const result: any = {};

  for (const key in before) {
    // eslint-disable-next-line no-prototype-builtins
    if (before.hasOwnProperty(key)) {
      if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
        result[key] = after[key];
      }
    }
  }
  return result;
}
