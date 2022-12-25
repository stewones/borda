/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type ReverseMap<T extends Record<keyof T, keyof any>> = {
  [P in T[keyof T]]: {
    [K in keyof T]: T[K] extends P ? K : never;
  }[keyof T];
};

// type Key2Value = {
//   foo: 'bar';
//   voo: 'doo';
// };

// type Value2Key = ReverseMap<Key2Value>;

export function objectFlip<T extends Record<string, any>>(obj: any) {
  const ret: any = {};
  Object.keys(obj).forEach((key) => {
    ret[obj[key]] = key;
  });
  return ret as ReverseMap<T>;
}
