/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export class LocalStorage {
  public static get(key: string): any {
    let result: any = window.localStorage.getItem(key);
    try {
      result = JSON.parse(result);
    } catch (err) {
      // that's fine if it's not a JSON
    }
    return result || null;
  }

  public static set(key: string, value: any): void {
    window.localStorage.setItem(key, JSON.stringify(value));
  }

  public static unset(key: string): void {
    window.localStorage.removeItem(key);
  }

  public static clear(): void {
    window.localStorage.clear();
  }
}
