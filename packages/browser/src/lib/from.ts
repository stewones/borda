/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

import 'reflect-metadata';
import { Document } from '@elegante/sdk';
import { defer as deferRXJS, Observable } from 'rxjs';

/**
 * Similiar to RxJS's `defer` api
 * but here we append a key metadata to be used for cache
 *
 * @export
 * @template T
 * @param {Promise<T>} source
 * @returns {*}  {Observable<T>}
 */
export function from<T = Document>(source: Promise<T>): Observable<T> {
  const key = Reflect.getMetadata('key', source);

  const def = deferRXJS(() => source);

  if (key) {
    Reflect.defineMetadata('key', key, def);
  }

  return def;
}
