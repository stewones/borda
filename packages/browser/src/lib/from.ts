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
 * Similar to RxJS's `from/defer` api
 *
 * but here we append any key metadata previously generated
 * if you're using the `query` api from `@elegante/sdk` this key
 * represents all the query payload and doing so
 * Elegante uses it to cache results whithout you having always to set a custom key
 *
 * essential to notice that wrapping a promise with this function doesn't automatically
 * executes the observable as it would be expected with RXJS's `from` api.
 * You still need to call `subscribe`. This is on purpose so we can have the best of both worlds (from + defer)
 *
 * @example
 * import { query } from '@elegante/sdk';
 * import { from } from '@elegante/browser';
 *
 * const users$ = from(query('User').filter({ name: 'John' }).findOne());
 *
 * @export
 * @template T
 * @param {Promise<T>} source
 * @returns {*}  {Observable<T>}
 */
export function from<T extends Document>(source: Promise<T>): Observable<T> {
  const key = Reflect.getMetadata('key', source);

  const def = deferRXJS(() => source);

  if (key) {
    Reflect.defineMetadata('key', key, def);
  }

  return def;
}
