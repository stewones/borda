/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

import { from } from 'rxjs';

import { fast, load } from '../src/lib';

load();
describe('Fast', () => {
  it('should memo responses', (done) => {
    const obs = from(Promise.resolve({ lol: { a: 1, b: 2 }, c: 3 }));

    fast(obs, { key: 'lol' }).subscribe((response) => {
      expect(response).toEqual({ lol: { a: 1, b: 2 }, c: 3 });
      done();
    });
  });

  it('should memo after extracting response by a custom path on a given object', (done) => {
    const obs = from(Promise.resolve({ lol: { a: 1, b: 2 }, c: 3 }));

    fast(obs, { key: 'some-key', path: 'lol.a' }).subscribe((response) => {
      expect(response).toEqual(1);
      done();
    });
  });

  it('should memo after extracting response by a custom path on a given array', (done) => {
    const obs = from(
      Promise.resolve([
        { yolo: { a: 1, b: 2 }, c: 3 },
        { yolo: { a: 3, b: 2 }, c: 1 },
      ])
    );
    fast(obs, { key: 'yolo', path: 'yolo.a' }).subscribe((response) => {
      expect(response).toEqual([1, 3]);
      done();
    });
  });

  it('should contain the specified key in the detailed payload', (done) => {
    const obs = from(
      Promise.resolve([
        { yolo: { a: 1, b: 2 }, c: 3 },
        { yolo: { a: 3, b: 2 }, c: 1 },
      ])
    );

    fast(obs, { key: 'yolo', mode: 'detailed' }).subscribe((response) => {
      expect(response).toEqual({
        hit: 'network',
        key: 'yolo',
        value: [
          { yolo: { a: 1, b: 2 }, c: 3 },
          { yolo: { a: 3, b: 2 }, c: 1 },
        ],
      });
      done();
    });
  });
});
