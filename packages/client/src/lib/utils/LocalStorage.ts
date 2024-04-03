/**
 * @license
 * Copyright Borda All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://borda.dev/license
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export class LocalStorage {
  public static get(key: string): any {
    let result = window.localStorage.getItem(key);
    try {
      return JSON.parse(result as string);
    } catch (err) {
      // that's fine if it's not a JSON
    }
    // but check if it's a boolean
    result = window.localStorage.getItem(key);
    if (result === 'true') {
      return true;
    }
    if (result === 'false') {
      return false;
    }

    // check for numbers
    if (!isNaN(Number(result))) {
      return Number(result);
    }

    return result || '';
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
