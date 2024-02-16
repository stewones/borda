/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * @license
 * Copyright Borda All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://borda.dev/license
 */

import { Db } from 'mongodb';

import {
  Document,
  InternalCollectionName,
  isEmpty,
  isNumber,
  pointer,
} from '@borda/client';

import { BordaServerQuery } from './query';

interface CacheMetadata {
  doc: Document;
  expires: number;
}

export class Cache {
  // eslint-disable-next-line @typescript-eslint/consistent-generic-constructors
  #memo: Map<string, CacheMetadata> = new Map();

  #enabled!: boolean;
  #inspect!: boolean;
  #cacheTTL!: number;

  get enabled(): boolean {
    return this.#enabled;
  }

  get size(): number {
    return this.#memo.size;
  }

  constructor({
    inspect,
    cacheTTL,
  }: {
    inspect?: boolean;
    cacheTTL?: number;
  } = {}) {
    this.#inspect = inspect || false;
    this.#cacheTTL = cacheTTL && isNumber(cacheTTL) ? cacheTTL : 1000 * 60 * 60;
    this.#enabled = this.#cacheTTL > 0;

    if (inspect && !this.#enabled) {
      console.log('❗ Document cache has been disabled.');
      console.log(
        '❗ Be sure to set cacheTTL to a positive number in production to boost queries performance.'
      );
    }
  }

  enable(): void {
    this.#enabled = true;
  }

  disable(): void {
    this.#enabled = false;
  }

  /**
   * a running clock to automatically invalidate cache based on the TTL
   * this helps to clean up memory and avoid service disruption by memory leaks
   */
  clock(): void {
    if (!this.#enabled) return;
    const documentCacheTTL = this.#cacheTTL;

    const now = Date.now();

    for (const [key, value] of this.#memo) {
      if (value.expires < now) {
        if (this.#inspect) {
          console.log('cache removed', key);
        }
        this.#memo.delete(key);
      }
    }

    setTimeout(this.clock.bind(this), documentCacheTTL);
  }

  invalidate({
    collection,
    objectId,
    data,
  }: {
    collection: string;
    objectId?: string;
    data?: Document;
  }): void {
    if (!this.#enabled) return;
    collection = InternalCollectionName[collection] ?? collection;
    const key = `doc:${collection}:${objectId}`;

    if (data && !isEmpty(data)) {
      if (collection === '_Session') {
        return this.invalidate({ collection, objectId: data['_token'] });
      }

      if (collection === '_User') {
        /**
         * we need to invalidate cache of all
         * sessions that belong to this user
         */
        const ref$ = this.get('Session$token', data['_id']);
        if (ref$) {
          const { token } = ref$;
          this.invalidate({ collection: '_Session', objectId: token });
          this.invalidate({
            collection: 'Session$token',
            objectId: data['_id'],
          });
          return;
        }
      }

      return this.invalidate({ collection, objectId: data['_id'] });
    } else {
      if (this.has(key)) {
        if (this.#inspect) {
          console.log('cache invalidated', key);
        }
        this.delete(key);
      }
    }
  }

  /**
   * get a key in the following format
   */
  get<T = Document>(collection: string, objectId: string): T | void {
    if (!this.#enabled) return;
    collection = InternalCollectionName[collection] ?? collection;

    const data: CacheMetadata | undefined = this.#memo.get(
      `doc:${collection}:${objectId}`
    );
    if (data && data.expires < Date.now()) {
      if (this.#inspect) {
        console.log('cache miss', `doc:${collection}:${objectId}`);
      }
      this.delete(`doc:${collection}:${objectId}`);
      return;
    }

    if (data) {
      if (this.#inspect) {
        console.log('cache hit', `doc:${collection}:${objectId}`);
      }
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
  set(collection: string, objectId: string, doc: Document) {
    if (!this.#enabled) return;
    const documentCacheTTL = this.#cacheTTL;

    collection = InternalCollectionName[collection] ?? collection;

    const key = `doc:${collection}:${objectId}`;

    if (!this.has(key)) {
      if (this.#inspect) {
        console.log('cache set', key);
      }
      this.#memo.set(`doc:${collection}:${objectId}`, {
        doc,
        expires: Date.now() + documentCacheTTL,
      });
    }
  }

  has(key: string): boolean {
    return this.#memo.has(key);
  }

  delete(key: string): boolean {
    return this.#memo.delete(key);
  }

  clear(): void {
    return this.#memo.clear();
  }

  keys(): IterableIterator<string> {
    return this.#memo.keys();
  }

  values(): IterableIterator<CacheMetadata> {
    return this.#memo.values();
  }

  entries(): IterableIterator<[string, CacheMetadata]> {
    return this.#memo.entries();
  }

  forEach(
    callbackfn: (
      value: CacheMetadata,
      key: string,
      map: Map<string, CacheMetadata>
    ) => void,
    thisArg?: CacheMetadata
  ): void {
    return this.#memo.forEach(callbackfn, thisArg);
  }
}

export async function ensureCacheInvalidation({
  db,
  cache,
  cacheTTL,
}: {
  db: Db;
  cache: Cache;
  cacheTTL: number;
}) {
  if (!cacheTTL) return;
  const collections = db.listCollections();
  const collectionsArray = await collections.toArray();
  for (const collectionInfo of collectionsArray) {
    if (
      collectionInfo.type === 'collection' &&
      !collectionInfo.name.startsWith('system.')
    ) {
      /**
       * listen to collection changes so we can invalidate the memoized queries
       */
      const collection = db.collection(collectionInfo.name);
      collection
        .watch(
          [
            {
              $match: {
                operationType: {
                  $in: ['update'],
                },
              },
            },
          ],
          collectionInfo.name === '_Session'
            ? {
                fullDocument: 'updateLookup',
              }
            : {}
        )
        .on('change', (change) => {
          const { documentKey, fullDocument }: any = change;
          const { _id } = documentKey;
          if (collectionInfo.name === '_Session') {
            cache.invalidate({
              collection: collectionInfo.name,
              data: fullDocument,
            });
          } else {
            cache.invalidate({
              collection: collectionInfo.name,
              objectId: _id,
            });
          }
        });
    }
  }
}

export async function ensureSessionInvalidation({
  db,
  query,
  cache,
}: {
  db: Db;
  cache: Cache;
  query: (collection: string) => BordaServerQuery;
}) {
  query('Session')
    .include(['user'])
    .on('update')
    .subscribe(({ doc }) => {
      // cache the session itself
      cache.set('Session', doc['token'], doc);
      if (doc['user']) {
        // cache a reference to the session token which belongs to the user
        cache.set('Session$token', doc['user'].objectId, {
          token: doc['token'],
        });
      }
    });

  query('Session')
    .include(['user'])
    .on('delete')
    .subscribe(({ doc }) => {
      cache.invalidate({ collection: 'Session', objectId: doc['token'] });
      if (doc['user']) {
        cache.invalidate({
          collection: 'Session$token',
          objectId: doc['user'].objectId,
        });
      }
    });

  /**
   * listen to user deletions
   */
  const collection = db.collection('_User');
  collection
    .watch(
      [
        {
          $match: {
            $or: [
              {
                operationType: {
                  $in: ['delete'],
                },
              },
              {
                operationType: {
                  $in: ['update'],
                },
                'fullDocument._expires_at': {
                  $exists: true,
                },
              },
            ],
          },
        },
      ],
      {
        fullDocument: 'updateLookup',
      }
    )
    .on('change', (change) => {
      const { documentKey }: any = change;
      const { _id } = documentKey;
      query('Session')
        .filter({
          user: pointer('User', _id),
        })
        .delete()
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .catch((_err) => {
          // it's fine if the session is already deleted or doesn't exist
        });
    });
}
