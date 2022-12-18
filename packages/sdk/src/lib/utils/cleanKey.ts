/**
 * @license
 * Copyright Intenseloop LTD All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

import { isEmpty } from './isEmpty';

/**
 * remove irrelevant chars from the json string
 * eg: { }, [ ], " "
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cleanKey(json: any): string {
  for (const key in json) {
    if (isEmpty(json[key])) {
      delete json[key];
    }
  }

  return (
    JSON.stringify(json)
      // eslint-disable-next-line no-useless-escape
      .replace(/[\{\}\[\]"]/g, '')
      .replace(/,/g, '.')
  );
}
