/**
 * @license
 * Copyright Borda All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://borda.dev/license
 */

export function removeUndefinedProperties<T>(obj: T): T {
  for (const prop in obj) {
    if (obj[prop] === undefined) {
      delete obj[prop];
    }
  }
  return obj;
}
