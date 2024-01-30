/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

import {
  Document,
  InternalCollectionName,
  log,
} from '@elegante/sdk';

import {
  EleganteServer,
} from '../lib_elegante/Server'; // @todo move cache and clock to the Borda instance

interface Metadata {
  doc: Document;
  expires: number;
}

const memo: Map<string, Metadata> = new Map();

/**
 * global flags
 */
let cache = true;

/**
 * Memo abstract class which provides access to the memoized data
 *
 * @export
 * @abstract
 * @class Memo
 */
export abstract class Cache {
  public static get enabled(): boolean {
    return cache;
  }

  public static enable(): void {
    cache = true;
  }

  public static disable(): void {
    cache = false;
  }

  /**
   * a running clock to automatically invalidate cache based on the TTL
   * this helps to clean up memory and avoid service disruption by memory leaks
   */
  public static clock(): void {
    if (!Cache.enabled) return;
    const documentCacheTTL = EleganteServer.params.documentCacheTTL;

    const now = Date.now();

    for (const [key, value] of memo) {
      if (value.expires < now) {
        log('cache removed', key);
        memo.delete(key);
      }
    }

    setTimeout(Cache.clock, documentCacheTTL);
  }

  public static invalidate(collection: string, objectId: string): void {
    if (!Cache.enabled) return;
    collection = InternalCollectionName[collection] ?? collection;
    const key = `doc:${collection}:${objectId}`;
    if (Cache.has(key)) {
      log('cache invalidated', key);
      Cache.delete(key);
    }
  }

  public static get size(): number {
    return memo.size;
  }

  /**
   * get a key in the following format
   */
  public static get<T = Document>(
    collection: string,
    objectId: string
  ): T | void {
    if (!Cache.enabled) return;
    collection = InternalCollectionName[collection] ?? collection;

    const data: Metadata | undefined = memo.get(
      `doc:${collection}:${objectId}`
    );
    if (data && data.expires < Date.now()) {
      log('cache miss', `doc:${collection}:${objectId}`);
      Cache.delete(`doc:${collection}:${objectId}`);
      return;
    }

    if (data) {
      log('cache hit', `doc:${collection}:${objectId}`);
      return data.doc as T;
    }

    return;
  }

  /**
   * set in-memory cache
   *
   * data is stored in the following format
   * considering internal collections automatically
   *
   * "doc:[collectionName]:[objectId]"
   *
   * ie:
   *
   * Cache.set('User', '1337', { objectId: '1337', name: 'John' })
   *
   * produces:
   *
   * {
   *  'doc:_User:1337': { expires: 1234567890, data: { objectId: '1337', name: 'John' } },
   * }
   */
  public static set(collection: string, objectId: string, doc: Document) {
    if (!Cache.enabled) return;
    const documentCacheTTL =
      EleganteServer.params.documentCacheTTL ?? 1000 * 60 * 60;

    collection = InternalCollectionName[collection] ?? collection;

    const key = `doc:${collection}:${objectId}`;

    if (!Cache.has(key)) {
      log('cache set', key);
      memo.set(`doc:${collection}:${objectId}`, {
        doc,
        expires: Date.now() + documentCacheTTL,
      });
    }
  }

  public static has(key: string): boolean {
    return memo.has(key);
  }

  public static delete(key: string): boolean {
    return memo.delete(key);
  }

  public static clear(): void {
    return memo.clear();
  }

  public static keys(): IterableIterator<string> {
    return memo.keys();
  }

  public static values(): IterableIterator<Metadata> {
    return memo.values();
  }

  public static entries(): IterableIterator<[string, Metadata]> {
    return memo.entries();
  }

  public static forEach(
    callbackfn: (
      value: Metadata,
      key: string,
      map: Map<string, Metadata>
    ) => void,
    thisArg?: Metadata
  ): void {
    return memo.forEach(callbackfn, thisArg);
  }
}

/**
 * pure functions
 */
export async function invalidateCache(collection: string, data: Document) {
  collection = InternalCollectionName[collection] ?? collection;

  if (collection === '_Session') {
    return Cache.invalidate(collection, data['_token']);
  }

  if (collection === '_User') {
    /**
     * we need to invalidate cache of all
     * sessions that belong to this user
     */
    const ref$ = Cache.get('Session$token', data['_id']);
    if (ref$) {
      const { token } = ref$;
      Cache.invalidate('_Session', token);
      Cache.invalidate('Session$token', data['_id']);
      return;
    }
  }

  return Cache.invalidate(collection, data['_id']);
}
