/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

export function removeUndefinedProperties<T>(obj: T): T {
  for (const prop in obj) {
    if (obj[prop] === undefined) {
      delete obj[prop];
    }
  }
  return obj;
}
