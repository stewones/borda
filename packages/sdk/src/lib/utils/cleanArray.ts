/**
 * @license
 * Copyright Intenseloop LTD All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export function cleanArray(arr: any[]) {
  return arr.filter((element) => {
    if (Object.keys(element).length !== 0) {
      return true;
    }
    return false;
  });
}
