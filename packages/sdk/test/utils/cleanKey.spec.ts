/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

import { cleanKey } from '../../src/lib/utils/cleanKey';

describe('cleanKey', () => {
  it('should not remove numbers or primitive values', () => {
    expect(
      cleanKey({
        function: 'something',
        a: 1,
        b: 2,
        name: 'john',
        options: { age: 18 },
      })
    ).toBe('function:something.a:1.b:2.name:john.options:age:18');
  });

  it('should work with array also', () => {
    expect(
      cleanKey({
        function: 'something',
        a: 1,
        b: 2,
        name: 'john',
        options: { age: 18 },
        friends: ['mike', 'jane'],
        groups: [{ name: 'lol' }, { name: 'dota' }],
      })
    ).toBe(
      'function:something.a:1.b:2.name:john.options:age:18.friends:mike.jane.groups:name:lol.name:dota'
    );
  });
});
