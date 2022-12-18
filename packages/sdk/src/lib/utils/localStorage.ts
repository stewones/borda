/**
 * @license
 * Copyright Intenseloop LTD All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { cloneDeep } from './cloneDeep';
import { isServer } from './isServer';

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
    window.localStorage.setItem(key, JSON.stringify(cloneDeep(value)));
  }

  public static unset(key: string): void {
    window.localStorage.removeItem(key);
  }

  public static clear(): void {
    window.localStorage.clear();
  }

  public static async estimate(): Promise<{
    percentageAvailable: number;
    remainingMB: number;
  }> {
    let percentageAvailable = 0;
    let remainingMB = 0;

    if (!isServer() && navigator.storage && navigator.storage.estimate) {
      const quota: any = await navigator.storage.estimate();

      // quota.usage -> Number of bytes used.
      // quota.quota -> Maximum number of bytes available.

      const percentageUsed = (quota.usage / quota.quota) * 100;
      const remaining = quota.quota - quota.usage;

      // convert remaining to MB
      remainingMB = remaining / 1024 / 1024;

      // convert to percentage available
      percentageAvailable = 100 - percentageUsed;
    }

    return {
      percentageAvailable,
      remainingMB,
    };
  }
}
