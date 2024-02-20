/**
 * @license
 * Copyright Borda All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://borda.dev/license
 */

import { isEmpty } from './isEmpty';

/**
 * remove irrelevant chars from the json string
 * eg: { }, [ ], " "
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cleanKey(json: any): string {
  try {
    for (const key in json) {
      if (typeof json[key] === 'object') {
        cleanKey(json[key]);
      } else {
        if (
          typeof json[key] !== 'number' &&
          typeof json[key] !== 'string' &&
          isEmpty(json[key])
        ) {
          delete json[key];
        }
      }
    }

    return (
      JSON.stringify(json)
        // eslint-disable-next-line no-useless-escape
        .replace(/[\{\}\[\]"]/g, '')
        .replace(/,/g, '.')
    );
  } catch (err) {
    return '';
  }
}
