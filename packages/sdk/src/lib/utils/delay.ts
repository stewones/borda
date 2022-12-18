/**
 * @license
 * Copyright Intenseloop LTD All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

/**
 * create a delay using setTimeout
 * time is in milliseconds
 *
 * @export
 * @param {number} time
 * @returns {*}
 */
export function delay(time: number) {
  return new Promise(function (resolve) {
    setTimeout(resolve, time);
  });
}
