/**
 * @license
 * Copyright Borda All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://borda.dev/license
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export function isPointer(value: any) {
  return (
    typeof value === 'string' &&
    value.includes('$') &&
    !value.startsWith('$') &&
    !value.endsWith('$') &&
    value.split('$').length === 2 &&
    value.split('$')[1].length === 10
  );
}
