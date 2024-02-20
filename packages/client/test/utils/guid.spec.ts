/**
 * @license
 * Copyright Borda All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://borda.dev/license
 */

import { guid } from '../../src/lib/utils/guid';

describe('Guid', () => {
  it('should make a new id of size 1', () => {
    const id = guid(1);
    expect(id.length).toBe(8);
  });

  it('should make a new id of size 2', () => {
    const id = guid(2);
    expect(id.length).toBe(12);
  });

  it('should make a new id of size 3', () => {
    const id = guid(3);
    expect(id.length).toBe(16);
  });

  it('should make a new id of size 4', () => {
    const id = guid(4);
    expect(id.length).toBe(20);
  });

  it('should make a new id with default size', () => {
    const id = guid();
    expect(id.length).toBe(36);
  });
});
