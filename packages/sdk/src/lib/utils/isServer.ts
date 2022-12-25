/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

export function isServer() {
  // return typeof module !== 'undefined' && module.exports;
  return typeof window === 'undefined';
}
