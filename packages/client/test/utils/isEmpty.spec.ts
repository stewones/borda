/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

import { isEmpty } from '../../src/lib/utils/isEmpty';

describe('isEmpty', () => {
  it('should return false for object with numbers', () => {
    expect(isEmpty({ function: 'something', a: 1, b: 2 })).toBe(false);
  });
});
