/**
 * @license
 * Copyright Borda All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://borda.dev/license
 */

import {
  finalize,
  Subject,
} from 'rxjs';

import { Borda } from './Borda';

export function publish<T = void>(key: string, value?: T) {
  if (Borda.pubsub[key]) {
    Borda.pubsub[key].next(value);
  }
}

export function subscribe<T = void>(key: string, handler: (arg: T) => void) {
  Borda.pubsub[key] = new Subject<T>();
  return Borda.pubsub[key]
    .pipe(finalize(() => unsubscribe(key)))
    .subscribe((value) => handler(value as T));
}

export function unsubscribe(key: string) {
  // cancel client listeners
  if (Borda.pubsub[key]) {
    Borda.pubsub[key].unsubscribe();
    delete Borda.pubsub[key];
  }
}
