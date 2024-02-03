/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { isPointer } from './isPointer';

export function isArrayPointer(value: any) {
  if (!Array.isArray(value)) return false;
  return value.every((item) => isPointer(item));
}
