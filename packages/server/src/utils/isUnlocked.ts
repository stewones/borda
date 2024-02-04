/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isUnlocked(locals: any) {
  return locals && locals['unlocked'] ? true : false;
}