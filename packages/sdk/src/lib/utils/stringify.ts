/**
 * @license
 * Copyright Intenseloop LTD All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const stringify = (obj: any, options = { preseverKeys: false }) => {
  let log = '';
  for (const k in obj) {
    log += `${options.preseverKeys ? k + ': ' : ''}${obj[k]} `;
  }
  return log.trim();
};
