/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * @license
 * Copyright Borda All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://borda.dev/license
 */

import { Borda } from './Borda';

export interface BordaSubscription {
  unsubscribe: () => void;
}

const handlerMap = new WeakMap<Function, string>();
let handlerCurrentId = 0;

function handlerId(handler: Function): string {
  let id = handlerMap.get(handler);
  if (!id) {
    id = `handler_${++handlerCurrentId}`;
    handlerMap.set(handler, id);
  }
  return id;
}

export function publish<T = void>(key: string, value?: T) {
  for (const listener of Borda.pubsub[key]) {
    listener.handler(value);
  }
}

export function subscribe<T = void>(key: string, handler: (arg: T) => void) {
  if (!Borda.pubsub[key]) {
    Borda.pubsub[key] = [];
  }

  const id = handlerId(handler);
  const unsubscribe = () => {
    Borda.pubsub[key] = Borda.pubsub[key].filter(
      (listener) => listener.id !== id
    );
  };

  Borda.pubsub[key].push({
    id,
    handler,
  });

  return {
    unsubscribe,
  } as BordaSubscription;
}

export function unsubscribe(key: string) {
  // cancel all client listeners
  delete Borda.pubsub[key];
}
