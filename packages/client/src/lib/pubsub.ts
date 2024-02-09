/**
 * @license
 * Copyright Borda All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://borda.dev/license
 */

// import { BordaClient } from './Client';

export function publish<T = void>(key: string, value?: T) {
  // if (BordaClient.pubsub[key]) {
  //   BordaClient.pubsub[key].next(value);
  // }
}

export function subscribe<T = void>(key: string, handler: (arg: T) => void) {
  return {};
  // BordaClient.pubsub[key] = new Subject<T>();
  // return BordaClient.pubsub[key]
  //   .pipe(finalize(() => unsubscribe(key)))
  //   .subscribe((value) => handler(value as T));
}

export function unsubscribe(key: string) {
  // cancel client listeners
  // if (BordaClient.pubsub[key]) {
  //   BordaClient.pubsub[key].unsubscribe();
  //   delete BordaClient.pubsub[key];
  // }
}
