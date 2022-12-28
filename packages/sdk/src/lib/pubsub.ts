/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

import { finalize, Subject, Subscription } from 'rxjs';

import { EleganteClient } from './Client';
import { Document } from './types/query';

export function publish<T = void>(key: string, value?: T) {
  if (EleganteClient.pubsub[key]) {
    EleganteClient.pubsub[key].next(value);
  }
}

export function subscribe<T extends Document>(
  key: string,
  handler: (arg: T) => void
): Subscription {
  EleganteClient.pubsub[key] = new Subject<T>();
  return EleganteClient.pubsub[key]
    .pipe(finalize(() => unsubscribe(key)))
    .subscribe((value) => handler(value as T));
}

export function unsubscribe(key: string): void {
  // cancel client listeners
  if (EleganteClient.pubsub[key]) {
    EleganteClient.pubsub[key].unsubscribe();
    delete EleganteClient.pubsub[key];
  }
}
