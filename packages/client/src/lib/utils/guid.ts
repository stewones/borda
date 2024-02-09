/**
 * @license
 * Copyright Borda All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://borda.dev/license
 */

export function guid(size = -1) {
  return size === 1
    ? random()
    : size === 2
    ? random() + random()
    : size === 3
    ? random() + random() + random()
    : size === 4
    ? random() + random() + random() + random()
    : random() +
      random() +
      '-' +
      random() +
      '-' +
      random() +
      '-' +
      random() +
      '-' +
      random() +
      random() +
      random();
}

function random() {
  return Math.floor((1 + Math.random()) * 0x10000)
    .toString(16)
    .substring(1);
}
