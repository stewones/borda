/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isEmpty(object: any) {
  if (!object) return true;
  for (const key in object) {
    // eslint-disable-next-line no-prototype-builtins
    if (object.hasOwnProperty(key)) {
      return false;
    }
  }
  return true;
}
