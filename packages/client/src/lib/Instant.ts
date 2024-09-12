/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import {
  Collection,
  Dexie,
  IndexableType,
  liveQuery,
  Table,
} from 'dexie';
import { singular } from 'pluralize';
import {
  bufferTime,
  distinctUntilChanged,
  from,
  fromEvent,
  interval,
  map,
  merge,
  startWith,
  Subject,
  Subscription,
  tap,
} from 'rxjs';
import { z } from 'zod';

import { fetcher } from './fetcher';
import { Document } from './types';
import { cloneDeep, guid, isServer } from './utils';
import { WebSocketFactory } from './websocket';

export type InstantSchemaField = z.ZodTypeAny;

export type InstantSyncStatus = 'created' | 'updated' | 'deleted';
export interface iQLByDirective {
  $by: string;
}
export interface iQLLimitDirective {
  $limit: number;
}

export interface InstantSyncResponseData {
  status: InstantSyncStatus;
  value: Document;
  collection?: string;
  updatedFields?: Record<string, any>;
  removedFields?: string[];
  truncatedArrays?: Array<{
    field: string;
    newSize: number;
  }>;
}

export type InstantSyncActivity = 'recent' | 'oldest';

export interface InstantSyncResponse {
  synced: string;
  collection: string;
  count: number;
  data: InstantSyncResponseData[];
  activity: InstantSyncActivity;
}

type SchemaType = Record<string, z.ZodType<any, any, any>>;

type FilterCondition<T> =
  | {
      $exists?: boolean;
      $nin?: any[];
      $regex?: string;
      $options?: string;
      $eq?: any;
    }
  | ((item: T) => boolean);

type QueryDirectives<T> = {
  $limit?: number;
  $skip?: number;
  $sort?: { [K in keyof T]?: number };
  $filter?:
    | {
        [K in keyof T]?: FilterCondition<T>;
      }
    | ((item: T) => boolean);
  $or?: Array<{ [K in keyof T]?: FilterCondition<T> | T }>;
  $by?: string;
};

export type iQL<T extends SchemaType, K extends keyof T = keyof T> = {
  [P in K]?: iQL<T, K> & QueryDirectives<z.infer<T[P]>>;
};

export const ejectPointerId = (pointer: string) => {
  return pointer.split('$')[1];
};

export const ejectPointerCollection = (pointer: string) => {
  return pointer.split('$')[0];
};

export const createObjectIdSchema = <T extends string>(p: T) =>
  z.string().min(9).max(36).brand<T>();

export const createSchema = <T extends SchemaType>(collection: string, p: T) =>
  z.object({
    _id: createObjectIdSchema(collection),
    _uuid: z.string().length(36).optional(),
    _sync: z.number().optional(),
    _created_at: z.string().optional(),
    _updated_at: z.string().optional(),
    _expires_at: z.string().optional(),
    _created_by: z.string().optional(),
    _updated_by: z.string().optional(),
    _deleted_by: z.string().optional(),
    ...p,
  });

/**
 * A brand typed string representation of the pointer
 * which identifies the collection and the objectId
 *
 * @example
 * const userId = createPointer('users', 'a1b2c3');
 * // userId => 'users$a1b2c3'
 *
 * @param p - pointer
 * @param objectId - objectId
 * @returns string
 */
export const createPointer = (collection: string, id: string) => {
  return `${collection}$${id}`;
};

const SyncSchema = z.object({
  collection: z.string(),
  count: z.number(),
  synced: z.string(),
  activity: z.enum(['recent', 'oldest']),
  status: z.enum(['complete', 'incomplete']),
});

export class Instant<T extends SchemaType> {
  public online = merge(
    fromEvent(!isServer() ? window : new EventTarget(), 'online').pipe(
      map(() => true)
    ),
    fromEvent(!isServer() ? window : new EventTarget(), 'offline').pipe(
      map(() => false)
    )
  ).pipe(startWith(navigator.onLine), distinctUntilChanged());

  public syncing = from(liveQuery(() => this.db.table('_sync').toArray())).pipe(
    map(
      (activities) =>
        activities.some(
          (item) => item.activity === 'oldest' && item.status === 'incomplete'
        ) && navigator.onLine
    ),
    startWith(false)
  );

  #size = 1_000;
  #buffer = 10_000;
  #name: string;
  #version: number;
  #db!: Dexie;
  #worker!: Worker;
  #serverURL: string;
  #schema: T;
  #index!: Partial<Record<keyof T, string[]>>;
  #inspect: boolean;
  #token!: string;
  #user!: string;
  #headers!: Record<string, string>;
  #params!: Record<string, string>;
  #wss: WebSocket | undefined;
  #pendingTasks: Subscription | undefined;
  #pendingPointersBusy = false;
  #pendingMutationsBusy = false;
  #batch = new Subject<{
    collection: string;
    synced: string;
    activity: InstantSyncActivity;
    token: string;
    headers: Record<string, string>;
    params: Record<string, string>;
  }>();

  #been_offline = false;
  #online = this.online
    .pipe(
      tap((isOnline) => {
        if (isOnline && this.#been_offline && this.#token) {
          this.syncBatch('recent');
          this.syncBatch('oldest');
          /* istanbul ignore next */
          if (this.#inspect) {
            console.log('🟢 client is online');
          }
        }
      }),
      tap((isOnline) => (this.#been_offline = !isOnline))
    )
    .subscribe();

  get inspect() {
    return this.#inspect;
  }

  get db() {
    if (!this.#db) {
      throw new Error(
        'Database not initialized. Try awaiting `ready()` first.'
      );
    }
    return this.#db;
  }

  constructor({
    schema,
    name,
    version = 1,
    serverURL,
    inspect,
    buffer,
    size,
    headers,
    params,
    index,
    session,
    user,
  }: {
    name: Capitalize<string>;
    version?: number;
    schema: T;
    index?: Partial<Record<keyof T, string[]>>;
    serverURL: string;
    inspect?: boolean | undefined;
    buffer?: number | undefined;
    size?: number | undefined;
    token?: string;
    headers?: Record<string, string>;
    params?: Record<string, string>;
    session?: string;
    user?: string;
  }) {
    this.#name = name;
    this.#schema = schema;
    this.#version = version;
    this.#serverURL = serverURL;
    this.#inspect = inspect || false;
    this.#buffer = buffer || this.#buffer;
    this.#size = size || this.#size;
    this.#headers = headers || {};
    this.#params = params || {};
    this.#index = index || {};
    this.#token = session || '';
    this.#user = user || '';
  }

  /**
   * The **ready** method is required in order to interact with the database.
   * It will generate a new Dexie schema based on the zod schema
   * and initialize the local database instance.
   *
   * @returns Promise<void>
   */
  public async ready() {
    try {
      // generate a new Dexie schema from the zod schema
      const dexieSchema: Record<string, string> = {};

      for (const tableName in this.#schema) {
        dexieSchema[tableName] = `${Object.keys(
          // @ts-ignore
          this.#schema[tableName].shape
        ).join(', ')}`;
      }

      // add custom indices
      for (const tableName in this.#schema) {
        const fields = this.#index[tableName] || [];
        if (fields.length === 0) {
          continue;
        }

        // Generate all possible index combinations
        const indexCombinations = this.#buildIndexCombinations(fields);

        // Join all index combinations
        const customIndices = indexCombinations.join(', ');

        dexieSchema[tableName] += `, ${customIndices}`;
      }

      // add internal schema
      dexieSchema['_sync'] = `[collection+activity], ${Object.keys(
        SyncSchema.shape
      ).join(', ')}`;

      const db = new Dexie(this.#name);

      db.version(this.#version).stores(dexieSchema);

      this.#db = db;
      this.#db.on('ready', (db) => {
        /* istanbul ignore next */
        if (this.#inspect && !isServer()) {
          // @ts-ignore
          window['insta'] = this;
        }
        Promise.resolve(db);
      });

      if (isServer()) {
        /**
         * task scheduler
         */
        this.#pendingTasks = interval(1000)
          .pipe(
            tap(
              async () =>
                await Promise.allSettled([
                  this.runPendingMutations(),
                  this.runPendingPointers(),
                ])
            )
          )
          .subscribe();

        /**
         * batch sync scheduler
         */
        this.#batch
          .pipe(
            bufferTime(this.#buffer),
            tap(async (collections) => {
              for (const {
                collection,
                activity,
                synced,
                token,
                headers,
                params,
              } of collections) {
                try {
                  /* istanbul ignore next */
                  const perf = performance.now();
                  const url = `${
                    this.#serverURL
                  }/sync/${collection}?activity=${activity}&synced=${synced}`;

                  await this.runBatchWorker({
                    url,
                    token,
                    headers,
                    params,
                  });

                  /* istanbul ignore next */
                  if (this.inspect) {
                    const syncDuration = performance.now() - perf;
                    const usage = await this.usage(collection);
                    console.log(
                      `💨 sync ${syncDuration.toFixed(2)}ms`,
                      collection,
                      activity,
                      synced
                    );
                    console.log('💾 estimated usage for', collection, usage);
                  }
                } catch (err) {
                  /* istanbul ignore next */
                  if (this.#inspect) {
                    console.error('Error scheduling sync', err);
                  }
                }
              }
            })
          )
          .subscribe();
      }
    } catch (error) {
      /* istanbul ignore next */
      if (this.#inspect) {
        console.error('❌ Error while initializing database', error);
      }
      return Promise.reject(error);
    }
  }

  public async usage(collection?: string) {
    if (collection) {
      const count = await this.db.table(collection).count();
      const sampleSize = Math.min(100, count);

      const samples = await this.db
        .table(collection)
        .limit(sampleSize)
        .toArray();

      let totalSize = 0;
      for (const sample of samples) {
        totalSize += new Blob([JSON.stringify(sample)]).size;
      }

      const averageSize = totalSize / sampleSize;
      const estimatedTotalSize = averageSize * count;
      const estimatedTotalMB = estimatedTotalSize / (1024 * 1024);

      return `${(estimatedTotalMB * 1.8).toFixed(2)} MB`;
    }

    // Original overall usage estimation
    const estimate = ((await navigator.storage.estimate()) || {}) as {
      quota: number;
      usage: number;
      usageDetails: {
        file: number;
        indexedDB: number;
        sqlite: number;
      };
    };

    const { usageDetails } = estimate;
    const { indexedDB } = usageDetails || { indexedDB: 0 };
    const total = indexedDB / (1024 * 1024);

    return `${total.toFixed(2)} MB`;
  }

  /**
   * Destroy the Instant instance
   *
   * @returns void
   */
  /* istanbul ignore next */
  async destroy({ db = true }: { db?: boolean } = {}) {
    this.#batch.complete();
    this.#online.unsubscribe();

    if (this.#worker && 'terminate' in this.#worker) {
      this.#worker.terminate();
    }

    if (db) {
      await this.#db.close({
        disableAutoOpen: true,
      });
      await this.#db
        .delete({
          disableAutoOpen: true,
        })
        .catch((err) => {
          // that's fine
        });
    } else if (this.#db && this.#db.isOpen()) {
      await this.#db.close({
        disableAutoOpen: true,
      });
    }

    if (this.#pendingTasks) {
      this.#pendingTasks.unsubscribe();
    }

    if (this.#wss && this.#wss.readyState === WebSocket.OPEN) {
      this.#wss.close();
    }

    this.#pendingMutationsBusy = false;
    this.#pendingPointersBusy = false;

    /* istanbul ignore next */
    if (this.#inspect) {
      console.log('🧹 Instant instance destroyed');
    }

    return Promise.resolve();
  }

  public setWorker({ worker }: { worker: Worker }) {
    this.#worker = worker;
  }

  /**
   * worker entry point
   * should be called with postMessage from the main thread
   *
   * @returns void
   */
  public worker() {
    return async ({ data }: { data: string }) => {
      try {
        const {
          url,
          sync = 'batch',
          token = '',
          headers = {},
          params = {},
        } = JSON.parse(data);

        if (!token) {
          return Promise.reject('No token provided');
        }

        this.#token = token;
        this.#headers = headers;
        this.#params = params;

        const perf = performance.now();

        /**
         * run the worker, it should:
         * 1. fetch filtered and paginated data from the server
         * 2. update the local indexedDB
         * 3. keep syncing older and new data in background
         *
         * now the ui can just query against the local db instead
         * including realtime updates via dexie livequery 🎉
         */
        if (sync === 'batch') {
          const { collection, activity, synced } = await this.runBatchWorker({
            url,
            token,
            headers,
            params,
          });

          /* istanbul ignore next */
          if (this.inspect) {
            const syncDuration = performance.now() - perf;
            const usage = await this.usage(collection);
            console.log(
              `💨 sync ${syncDuration.toFixed(2)}ms`,
              collection,
              activity,
              synced
            );
            console.log('💾 estimated usage for', collection, usage);
          }
        }

        if (sync === 'live') {
          this.runLiveWorker({ url, token, headers, params });
        }
      } catch (err) {
        /* istanbul ignore next */
        if (this.inspect) {
          console.error('Error running worker', err);
        }
      }
    };
  }

  async #useSync({
    collection,
    activity,
  }: {
    collection: string;
    activity: InstantSyncActivity;
  }) {
    return ((await this.db
      .table('_sync')
      .where({ collection, activity })
      .first()) || {
      activity,
      synced: null,
      status: 'incomplete',
    }) as z.infer<typeof SyncSchema>;
  }

  async #setSync({
    collection,
    synced,
    activity,
    count,
    status = 'incomplete',
  }: {
    collection: string;
    synced?: string;
    activity: InstantSyncActivity;
    count: number;
    status?: 'complete' | 'incomplete';
  }) {
    const sync = await this.db
      .table('_sync')
      .where({ collection, activity })
      .first();

    const payload = { collection, synced, count, status };

    if (sync) {
      return this.db
        .table('_sync')
        .where({ collection, activity })
        .modify(payload);
    }

    return this.db.table('_sync').put({ ...payload, activity });
  }

  async runPendingMutations() {
    console.log('oie 1');
    if (this.#pendingMutationsBusy) {
      return;
    }
    console.log('oie 2');
    try {
      this.#pendingMutationsBusy = true;

      const collections = Object.keys(this.#schema);

      for (const collection of collections) {
        const query = {
          [collection as keyof T]: {
            $filter: {
              _sync: {
                $eq: 1,
              },
            },
          },
        };

        const pending = await this.query(query as unknown as iQL<T>);
        const data = pending[collection as keyof T];

        for (const item of data) {
          // check for validation, if fails, skip
          const { type, message, summary, errors } = this.validate(
            collection,
            item
          );

          if (errors) {
            /* istanbul ignore next */
            if (this.#inspect) {
              console.error(
                '❌ validation failed',
                type,
                message,
                summary,
                errors
              );
            }
            continue;
          }

          let url = `${this.#serverURL}/sync/${collection}`;

          const token = this.#token;
          const headers = this.#headers;
          const params = this.#params;
          const method = item['_expires_at']
            ? 'DELETE'
            : item['_created_at'] !== item['_updated_at']
            ? 'PUT'
            : 'POST';

          if (['DELETE', 'PUT'].includes(method)) {
            url += `/${item['_id']}`;
          }

          await this.runMutationWorker({
            collection,
            url,
            data: item,
            method,
            token,
            headers,
            params,
          });
        }

        if (data.length > 0) {
          /* istanbul ignore next */
          if (this.#inspect) {
            console.log('🔵 pending mutations', data);
          }
        }
      }
    } catch (error) {
      /* istanbul ignore next */
      if (this.#inspect) {
        console.error('Error while running pending mutations', error);
      }
    } finally {
      this.#pendingMutationsBusy = false;
    }
  }

  async runPendingPointers() {
    if (this.#pendingPointersBusy) {
      return;
    }

    this.#pendingPointersBusy = true;

    const collections = Object.keys(this.#schema);
    for (const collection of collections) {
      // check for pointers using uuid
      const query = {
        [collection as keyof T]: {
          $filter: (item: Document) => {
            // Check for fields starting with _p_ and containing a dash in their value
            return Object.entries(item).some(
              ([key, value]) =>
                key.startsWith('_p_') &&
                typeof value === 'string' &&
                value.includes('-')
            );
          },
        },
      };

      // replace any pending pointers with the actual data
      const pending = await this.query(query as unknown as iQL<T>);
      const data = pending[collection as keyof T];

      for (const item of data) {
        const pointers = Object.entries(item).filter(
          ([key, value]) =>
            key.startsWith('_p_') &&
            typeof value === 'string' &&
            value.includes('-')
        );

        for (const [key, value] of pointers) {
          const pointerCollection = ejectPointerCollection(value as string);
          const pointerUuid = ejectPointerId(value as string);

          // grab the pointer data
          const pointerData = await this.query({
            [pointerCollection]: {
              $filter: {
                _uuid: {
                  $eq: pointerUuid,
                },
              },
            },
          } as unknown as iQL<T>);

          const pointer = pointerData[pointerCollection][0];

          if (pointer && !pointer._id.includes('-')) {
            // update the item with the pointer data
            item[key] = createPointer(pointerCollection, pointer._id);

            // update the item in the database
            await this.db.table(collection).update(item._id, item);

            /* istanbul ignore next */
            if (this.#inspect) {
              console.log('✅ pointer updated', pointerData);
            }
          }
        }
      }
    }

    this.#pendingPointersBusy = false;
  }

  /**
   * Sync paginated data from a given collection outside the main thread
   *
   * @returns Promise<void>
   */
  async runBatchWorker({
    url,
    token,
    headers,
    params,
  }: {
    url: string;
    token: string;
    headers: Record<string, string>;
    params: Record<string, string>;
  }) {
    if (!this.db) {
      await this.ready();
    }

    const customParams = new URLSearchParams(params).toString();
    if (customParams) {
      url += `&${customParams}`;
    }

    const { synced, collection, data, count, activity } =
      await fetcher<InstantSyncResponse>(url, {
        direct: true,
        method: 'GET',
        headers: {
          authorization: `Bearer ${token}`,
          ...headers,
        },
      });

    // const isMobile =
    //   /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    //     navigator.userAgent
    //   );

    await this.db.transaction('rw!', this.db.table(collection), async () => {
      for (const { status, value } of data) {
        await this.#syncProcess({
          collection,
          status,
          value,
        });
      }
    });

    // check if we need to schedule a new local sync
    // based on the number of local documents
    const remoteCount = count;

    let localCount = 0;
    if (activity === 'oldest') {
      localCount = await this.db
        .table(collection)
        .where('_updated_at')
        .belowOrEqual(synced)
        .count();
    } else {
      localCount = await this.db
        .table(collection)
        .where('_created_at')
        .aboveOrEqual(synced)
        .count();
    }

    // persist sync details
    // in case of oldest order, we need to finalize the sync
    // so it then only fetch new data via recent order
    // recent never ends so the client can always try to catch up
    if (localCount >= remoteCount && activity === 'oldest') {
      await this.#setSync({
        collection,
        activity,
        count,
        synced,
        status: 'complete',
      });
    } else {
      await this.#setSync({ collection, activity, count, synced });
    }

    // schedule next sync
    // we skip this on mobile devices to avoid unecessary data consumption
    // !isMobile && (needs a more robust implementation, like set a max storage setting)
    if (localCount < remoteCount) {
      /* istanbul ignore next */
      if (this.#inspect) {
        console.log(
          '⏰ scheduling next sync in',
          this.#buffer,
          'for',
          collection,
          activity,
          synced
        );
      }
      this.addBatch({
        collection,
        synced,
        activity,
        token,
        headers,
        params,
      });
    }

    return {
      collection,
      activity,
      synced,
    };
  }

  /**
   * Open a websocket connection to the server
   * and keep live data in sync with local db
   *
   * @returns void
   */
  async runLiveWorker({
    url,
    headers,
    params,
  }: {
    url: string;
    token?: string;
    headers?: Record<string, string>;
    params?: Record<string, string>;
  }) {
    let wssFinished = false;
    let wssConnected = false;
    let hasConnected = false;

    const customParams = new URLSearchParams(params);
    const customHeaders = new Headers(headers);

    const finalParams: Record<string, string> = {};

    customParams.forEach((value, key) => {
      finalParams[key] = value;
    });

    customHeaders.forEach((value, key) => {
      finalParams[key] = value;
    });

    if (Object.keys(finalParams).length > 0) {
      url += `&${new URLSearchParams(finalParams).toString()}`;
    }

    const webSocket: WebSocketFactory = {
      onOpen: (ws) => {
        this.#wss = ws;
        wssConnected = true;
        /* istanbul ignore next */
        if (this.#inspect) {
          console.log('🟡 sync live worker open');
        }
      },

      onError: (ws, err) => {
        /* istanbul ignore next */
        if (this.#inspect) {
          console.log('🔴 sync live worker error', err);
        }
      },

      onConnect: (ws) => {
        hasConnected = true;
        /* istanbul ignore next */
        if (this.#inspect) {
          console.log('🟢 sync live worker connected');
        }
      },

      onMessage: async (ws: WebSocket, message: MessageEvent) => {
        const { collection, status, value, updatedFields } = JSON.parse(
          message.data || '{}'
        ) as {
          collection: string;
          status: InstantSyncStatus;
          value: Document;
          updatedFields?: Record<string, any>;
        };

        try {
          // needs to handle data owner scenario with uuid
          if (status === 'created') {
            // make sure to mark as synced and update with server timestamp
            const uuid = value['_uuid'];
            if (uuid) {
              const localDocByUuid = await this.db
                .table(collection as string)
                .get(uuid);

              if (localDocByUuid) {
                await this.db.transaction(
                  'rw!',
                  this.db.table(collection as string),
                  async () => {
                    // gotta delete the old doc and create new one with server timestamp
                    await this.db.table(collection as string).delete(uuid);
                    await this.db.table(collection as string).add({
                      ...value,
                      _sync: 0, // to make sure response is marked as synced
                    });
                  }
                );
              } else {
                await this.db.table(collection as string).add({
                  ...value,
                  _sync: 0, // to make sure response is marked as synced
                });
              }
            }
          } else {
            // handle all other cases
            await this.#syncProcess({
              collection,
              status,
              value,
              updatedFields,
            });
          }

          // update last sync
          const synced = value['_updated_at'];
          await this.#setSync({
            collection,
            activity: 'recent',
            synced,
            count: 0,
          });
        } catch (err) {
          /* istanbul ignore next */
          if (this.#inspect) {
            console.log('🔴 live mutation failed', collection, value, err);
          }
        }
      },

      onClose: (ws, ev) => {
        /* istanbul ignore next */
        if (this.inspect) {
          console.log('🟣 sync live worker closed', ev.code);
        }

        // 1000 is a normal close, so we can safely close on it
        if (wssFinished || ev?.code === 1000 || !hasConnected) {
          /* istanbul ignore next */
          if (this.#inspect) {
            console.log('🔴 closing websocket', ev.code);
          }
          this.#wss?.close();
          return;
        }

        if (wssConnected) {
          wssConnected = false;
          this.#wss?.close();
          /* istanbul ignore next */
          if (this.inspect) {
            // code 1006 means the connection was closed abnormally (eg Cloudflare timeout)
            // locally it also happens on server hot reloads
            console.log('🔴 sync live worker disconnected', ev.code);
          }
        }

        // retry
        setTimeout(() => {
          /* istanbul ignore next */
          if (this.inspect) {
            console.log('🟡 sync live worker on retry');
          }
          this.#buildWebSocket(url)(webSocket);
        }, 1_000);
      },
    };

    /**
     * connect to the server
     */
    this.#buildWebSocket(url)(webSocket);
  }

  async runMutationWorker({
    collection,
    url,
    data,
    token,
    headers,
    params,
    method,
  }: {
    collection: string;
    url: string;
    method: 'POST' | 'PUT' | 'DELETE';
    data: Document;
    token?: string;
    headers?: Record<string, string>;
    params?: Record<string, string>;
  }) {
    if (!navigator.onLine) {
      /* istanbul ignore next */
      if (this.#inspect) {
        console.log('🔴 mutation skipped', 'no internet');
      }
      return;
    }

    const customParams = new URLSearchParams(params);
    const customHeaders = new Headers(headers);

    const finalParams: Record<string, string> = {};

    customParams.forEach((value, key) => {
      finalParams[key] = value;
    });

    customHeaders.forEach((value, key) => {
      finalParams[key] = value;
    });

    if (Object.keys(finalParams).length > 0) {
      url += `?${new URLSearchParams(finalParams).toString()}`;
    }

    try {
      // post to the server
      await fetcher(url, {
        direct: true,
        method,
        body: data,
        headers: {
          authorization: `Bearer ${token}`,
          ...headers,
        },
      });

      // mark record as synced since the network request was successful
      await this.db.table(collection).update(data['_id'], {
        _sync: 0,
      });
    } catch (err) {
      console.error('🔴 Error mutating document', collection, data, err);
    }
  }

  async #syncLive() {
    const url = `${this.#serverURL.replace('http', 'ws')}/sync/live?session=${
      this.#token
    }`;
    this.#worker.postMessage(
      JSON.stringify({
        url,
        sync: 'live',
        token: this.#token,
        headers: this.#headers,
        params: this.#params,
      })
    );
  }

  async syncBatch(activity: InstantSyncActivity) {
    try {
      const collections = Object.keys(this.#schema);

      for (const collection of collections) {
        const sync = await this.#useSync({
          collection,
          activity,
        });

        if (activity === 'recent' && !sync.synced) {
          // try to get the most recent _updated_at from the local db
          const mostRecentUpdatedAt = await this.db
            .table(collection)
            .orderBy('_updated_at')
            .reverse()
            .first()
            .then((doc) => doc?._updated_at);

          if (mostRecentUpdatedAt) {
            sync.synced = mostRecentUpdatedAt;
          } else {
            // otherwise we default to current date
            sync.synced = new Date().toISOString();
          }
        }

        if (sync.status === 'incomplete') {
          console.log('🔵 syncing', collection, sync);
          await this.#syncWorker({
            collection,
            synced: sync.synced,
            activity,
          });
        }
      }
    } catch (err) {
      console.error('Error syncing', err);
    }
  }

  async #syncWorker({
    collection,
    synced,
    activity,
  }: {
    collection: string;
    synced: string;
    activity: InstantSyncActivity;
  }) {
    let url = `${this.#serverURL}/sync/${collection}?activity=${activity}`;

    if (synced) {
      url += `&synced=${synced}`;
    }

    await this.#worker.postMessage(
      JSON.stringify({
        url,
        sync: 'batch',
        token: this.#token,
        headers: this.#headers,
        params: this.#params,
      })
    );
  }

  async #syncProcess({
    collection,
    status,
    value,
    updatedFields,
  }: {
    collection: string;
    status: InstantSyncStatus;
    value: Document;
    updatedFields?: Record<string, any>;
  }) {
    const persist: Record<
      InstantSyncStatus,
      (
        collection: string,
        value: Document,
        updatedFields?: Record<string, any>
      ) => Promise<void>
    > = {
      created: async (collection: string, value: Document) => {
        await this.db
          .table(collection)
          .add({ ...value, _sync: 0 })
          .catch((err) => {
            /* istanbul ignore next */
            if (this.#inspect) {
              console.error('Error adding document', collection, value, err);
            }
          });
      },
      updated: async (
        collection: string,
        value: Document,
        updatedFields?: Record<string, any>
      ) => {
        // check if doc exits, if not, create it
        const doc = await this.db.table(collection).get(value['_id']);
        if (!doc) {
          await persist.created(collection, value);
        } else {
          await this.db
            .table(collection)
            .update(value['_id'], {
              ...(updatedFields ? updatedFields : value),
              _sync: 0,
            })
            .catch((err) => {
              /* istanbul ignore next */
              if (this.#inspect) {
                console.error(
                  'Error updating document',
                  collection,
                  value,
                  err
                );
              }
            });
        }
      },
      deleted: async (collection: string, value: Document) => {
        await this.db
          .table(collection)
          .delete(value['_id'])
          .catch((err) => {
            /* istanbul ignore next */
            if (this.#inspect) {
              console.error('Error deleting document', collection, value, err);
            }
          });
      },
    };
    await persist[status](collection, value, updatedFields);
  }

  #buildWebSocket(url: string) {
    return (factory: WebSocketFactory) => {
      const { onConnect, onOpen, onError, onClose, onMessage } = factory;
      const ws = new WebSocket(url);

      ws.onopen = (ev: Event) => onOpen(ws, ev);
      ws.onerror = (err: Event) => onError(ws, err);
      ws.onclose = (ev: CloseEvent) => onClose(ws, ev);
      ws.onmessage = (ev: MessageEvent) => onMessage(ws, ev);

      const timer = setInterval(() => {
        if (ws.readyState === 1) {
          clearInterval(timer);
          onConnect(ws);
        }
      }, 1);
    };
  }

  #buildIndexCombinations(fields: string[]): string[] {
    const combo: string[] = [];

    const permute = (arr: string[]): string[][] => {
      if (arr.length <= 1) return [arr];
      return arr.flatMap((item, i) =>
        permute([...arr.slice(0, i), ...arr.slice(i + 1)]).map((perm) => [
          item,
          ...perm,
        ])
      );
    };

    for (let i = 1; i <= fields.length; i++) {
      const combs = this.#getIndexCombinations(fields, i);
      for (const comb of combs) {
        const perms = permute(comb);
        for (const perm of perms) {
          combo.push(`[${perm.join('+')}]`);
        }
      }
    }

    return [...new Set(combo)]; // Remove any duplicates
  }

  #getIndexCombinations(arr: string[], k: number): string[][] {
    const result: string[][] = [];

    const combine = (start: number, current: string[]) => {
      if (current.length === k) {
        result.push([...current]);
        return;
      }

      for (let i = start; i < arr.length; i++) {
        current.push(arr[i]);
        combine(i + 1, current);
        current.pop();
      }
    };

    combine(0, []);
    return result;
  }

  public addBatch({
    collection,
    synced,
    activity,
    token,
    headers,
    params,
  }: {
    collection: string;
    synced: string;
    activity: InstantSyncActivity;
    token: string;
    headers: Record<string, string>;
    params: Record<string, string>;
  }) {
    this.#batch.next({
      collection,
      synced,
      activity,
      token,
      headers,
      params,
    });
  }

  public mutate<C extends keyof T>(collection: C) {
    if (!this.#user) {
      throw new Error(
        'User id not set. Try to pass the user id as `user` to the Instant constructor or `sync` method.'
      );
    }
    if (!this.#token) {
      throw new Error(
        'Token not set. Try to pass the session token as `session` to the Instant constructor or `sync` method.'
      );
    }
    return {
      add: async (
        value: Partial<z.infer<T[keyof T]>> & {
          _id?: string;
          _uuid?: string;
          _sync?: number;
          _created_at?: string;
          _updated_at?: string;
          _created_by?: string;
          _updated_by?: string;
          _expires_at?: string;
          _deleted_by?: string;
        }
      ) => {
        const now = new Date().toISOString();
        value._sync = 1;
        value._created_at = now;
        value._updated_at = now;
        value._id = guid();
        value._uuid = value._id;
        value._created_by = createPointer('users', this.#user);
        value._updated_by = createPointer('users', this.#user);

        await this.db.transaction(
          'rw!',
          this.db.table(collection as string),
          async () => {
            await this.db.table(collection as string).add(value);
          }
        );

        return value;
      },
      update: async (id: string, value: Partial<z.infer<T[keyof T]>>) => {
        const currentDoc = await this.db.table(collection as string).get(id);
        if (!currentDoc) {
          throw new Error('Document not found');
        }

        // calc what changed excluding _updated_at, _created_at, _sync
        const updatedFields = Object.keys(value).reduce((acc, key) => {
          if (
            !['_updated_at', '_created_at', '_sync'].includes(key) &&
            value[key] !== currentDoc[key]
          ) {
            acc[key] = value[key];
          }
          return acc;
        }, {} as Record<string, any>);

        // skip if nothing changed
        if (Object.keys(updatedFields).length === 0) {
          return;
        }

        await this.db.transaction(
          'rw!',
          this.db.table(collection as string),
          async () => {
            await this.db.table(collection as string).update(id, {
              ...value,
              _sync: 1,
              _updated_at: new Date().toISOString(),
              _updated_by: createPointer('users', this.#user),
              _updated_fields: updatedFields,
            });
          }
        );
      },
      delete: async (id: string) => {
        await this.db.transaction(
          'rw!',
          this.db.table(collection as string),
          async () => {
            await this.db.table(collection as string).update(id, {
              _sync: 1,
              _updated_at: new Date().toISOString(),
              _expires_at: new Date().toISOString(),
              _deleted_by: createPointer('users', this.#user),
            });
          }
        );
      },
    };
  }

  public validate(collection: string, data: unknown) {
    const schema = this.#schema[collection];

    try {
      (schema as z.ZodObject<any>).strict().parse(data);
    } catch (zodError) {
      if (zodError instanceof z.ZodError) {
        return {
          type: 'validation_error',
          message: 'Invalid data provided',
          summary: `The data provided for ${collection} is not valid.`,
          errors: zodError.errors.map((err) => ({
            path: err.path.join('.'),
            message: err.message,
          })),
        };
      }
      throw zodError; // Re-throw if it's not a ZodError
    }

    return {};
  }

  /**
   * starts the sync process. usually called after user login because a session and user id are required.
   * don't forget to handle extra permissions on the server and make your endpoint even more secure.
   *
   * @returns Promise<void>
   */
  public async sync({
    /**
     * session token used to authenticate the requests on the server
     */
    session,
    /**
     * user id used to create pointers when mutating data
     */
    user,
    /**
     * custom headers to send to the server
     */
    headers,
    /**
     * custom query params to send to the server
     */
    params,
  }: {
    session: string;
    user: string;
    headers?: Record<string, string>;
    params?: Record<string, string>;
  }) {
    if (!this.db) {
      throw new Error(
        'Database not initialized. Try awaiting `ready()` first.'
      );
    }

    if (!this.#worker) {
      throw new Error(
        // @todo add documentation and links
        'Worker not initialized. Try instantiating a worker and adding it to Instant.setWorker({ worker })'
      );
    }

    if (!this.#serverURL) {
      throw new Error('Server URL is required to sync');
    }

    this.#token = session;
    this.#user = user;
    this.#headers = headers || {};
    this.#params = params || {};

    await Promise.allSettled([
      this.#syncLive(),
      this.syncBatch('oldest'),
      this.syncBatch('recent'),
    ]);
  }

  public syncPending(row: Document) {
    return row['_expires_at'] || row['_id'].includes('-') || row['_sync'] === 1;
  }

  /**
   * count local data
   *
   * @example
   * const count = await insta.count('users', {
   *     $filter: {
   *       name: { $eq: 'Raul' },
   *     },
   * });
   *
   * // console.log(count)
   * // 1
   */
  public async count<C extends keyof T>(
    collection: C,
    query: Exclude<QueryDirectives<z.infer<T[keyof T]>>, '$by'> & iQL<T>
  ) {
    let table = this.db.table(collection as string);
    const tableQuery = query as QueryDirectives<z.infer<T[keyof T]>> & iQL<T>;

    // Apply $filter
    if (tableQuery.$filter) {
      if (typeof tableQuery.$filter === 'function') {
        // If $filter is a function, use it directly
        table = table.filter(tableQuery.$filter) as unknown as Table<
          any,
          IndexableType
        >;
      } else {
        for (const [field, condition] of Object.entries(tableQuery.$filter)) {
          if (
            typeof condition === 'object' &&
            condition &&
            '$exists' in condition
          ) {
            table = table.filter(
              (item) => item[field] != null
            ) as unknown as Table<any, IndexableType>;
          }
          if (
            typeof condition === 'object' &&
            condition &&
            '$nin' in condition
          ) {
            table = table.filter(
              (item) => !(condition.$nin ?? []).includes(item[field])
            ) as unknown as Table<any, IndexableType>;
          }
        }
      }
    }

    return table.count();
  }

  /**
   * query syntax based on a graph of collections
   * so we can have easy access to nested data, while reusing
   * mongodb query style which is then translated to dexie
   *
   * server should follow the same pattern so we can have
   * the same query format for both client and server
   *
   * @example
   * const query = {
   *   users: {
   *     $limit: 10,
   *     $skip: 0,
   *     $or: [
   *       { title: { $exists: true } },
   *       { status: { $nin: ['draft', 'archived'] } }
   *     ],
   *     posts: {
   *       $by: 'author',
   *       $limit: 10,
   *       $skip: 0,
   *       $sort: { rating: -1 },
   *       $filter: {
   *         email: { $regex: 'eli', $options: 'i' }
   *       },
   *     },
   *   },
   * }
   */

  public async query<Q extends iQL<T>>(
    iql: Q
  ): Promise<{
    [K in keyof Q]: z.infer<T[K & keyof T]>[];
  }> {
    return this.#executeQuery(iql);
  }

  #getPointerField(
    childTable: keyof T,
    parentTable: keyof T
  ): string | undefined {
    const childSchema = this.#schema[childTable];
    if (!childSchema || !('shape' in childSchema)) return undefined;

    // First, check for fields starting with _p_
    for (const fieldName of Object.keys(
      (childSchema as unknown as z.ZodObject<any, any, any>).shape
    )) {
      if (
        fieldName.startsWith('_p_') &&
        fieldName.endsWith(singular(parentTable as string))
      ) {
        return fieldName;
      }
    }

    // If not found, check for pointer fields
    for (const [fieldName, fieldSchema] of Object.entries(
      (childSchema as unknown as z.ZodObject<any, any, any>).shape
    )) {
      if (
        fieldSchema instanceof z.ZodBranded &&
        fieldSchema._def.type instanceof z.ZodObject
      ) {
        const innerShape = fieldSchema._def.type.shape;
        if ('collection' in innerShape) {
          return fieldName;
        }
      }
    }

    return undefined;
  }

  async #executeQuery<Q extends iQL<T>>(
    queryObject: Q,
    parentTable?: keyof T,
    parentId?: string
  ): Promise<{
    [K in keyof Q]: z.infer<T[K & keyof T]>[];
  }> {
    const result = {} as {
      [K in keyof Q]: z.infer<T[K & keyof T]>[];
    };

    for (const tableName in queryObject) {
      if (
        Object.prototype.hasOwnProperty.call(queryObject, tableName) &&
        !tableName.startsWith('$')
      ) {
        const table = this.db.table(tableName);
        const tableQuery = queryObject[tableName] as QueryDirectives<
          z.infer<T[keyof T]>
        > &
          iQL<T>;

        let collection: Collection<
          z.infer<T[keyof T]>,
          IndexableType
        > = table as unknown as Collection<z.infer<T[keyof T]>, IndexableType>;

        // Handle parent relationship
        if (parentTable && parentId) {
          const pointerField = this.#getPointerField(
            tableName as keyof T,
            parentTable
          );
          const parentTableAsBy = `_p_${singular(parentTable as string)}`;

          if (pointerField) {
            collection = collection.filter(
              (item) =>
                item[pointerField] === `${parentTable as string}$${parentId}`
            );
          } else if (parentTableAsBy in collection) {
            collection = collection.filter(
              (item) =>
                item[parentTableAsBy] === `${parentTable as string}$${parentId}`
            );
          }
        }

        // Apply $sort
        if (tableQuery.$sort && Object.keys(tableQuery.$sort).length > 0) {
          const sortFields = Object.entries(tableQuery.$sort);

          // Construct the compound index string with brackets
          const indexString = `[${sortFields
            .map(([field, _]) => field)
            .join('+')}]`;

          // Apply the sort
          collection = (
            collection as unknown as Table<z.infer<T[keyof T]>, IndexableType>
          ).orderBy(indexString);

          // Apply reverse for descending order for the first field
          // cause apparently we can't do multi-sorting with compound indexes yet
          if (sortFields.length > 0 && sortFields[0][1] === -1) {
            collection = collection.reverse();
          }
        }

        // Apply $filter
        if (tableQuery.$filter) {
          if (typeof tableQuery.$filter === 'function') {
            // If $filter is a function, use it directly
            collection = collection.filter(tableQuery.$filter);
          } else {
            for (const [field, condition] of Object.entries(
              tableQuery.$filter
            )) {
              if (condition && '$exists' in condition) {
                collection = collection.filter((item) => item[field] != null);
              }
              if (condition && '$nin' in condition && condition.$nin) {
                collection = collection.filter(
                  (item) => !(condition.$nin ?? []).includes(item[field])
                );
              }
              if (condition && '$regex' in condition && condition.$regex) {
                const regex = new RegExp(
                  condition.$regex,
                  condition.$options ?? 'i'
                );
                collection = collection.filter((item) =>
                  regex.test(item[field])
                );
              }
              if (condition && '$eq' in condition) {
                collection = collection.filter(
                  (item) => item[field] === condition.$eq
                );
              }
            }
          }
        }

        // Apply $skip
        if (tableQuery.$skip) {
          collection = collection.offset(tableQuery.$skip);
        }

        // Apply $limit
        if (tableQuery.$limit) {
          collection = collection.limit(tableQuery.$limit);
        }

        // Apply $or
        if (tableQuery.$or) {
          collection = collection.filter((item) => {
            return tableQuery.$or!.some((condition) => {
              return Object.entries(condition).every(
                ([field, fieldCondition]) => {
                  if (typeof fieldCondition === 'object') {
                    if ('$exists' in fieldCondition) {
                      return fieldCondition.$exists
                        ? item[field] != null
                        : item[field] == null;
                    }
                    if ('$nin' in fieldCondition) {
                      return !(fieldCondition.$nin ?? []).includes(item[field]);
                    }
                    if ('$regex' in fieldCondition) {
                      const regex = new RegExp(
                        fieldCondition.$regex ?? '',
                        fieldCondition.$options ?? 'i'
                      );
                      return regex.test(item[field]);
                    }
                    if ('$eq' in fieldCondition) {
                      return item[field] === fieldCondition.$eq;
                    }
                  } else {
                    return item[field] === fieldCondition;
                  }
                  return false;
                }
              );
            });
          });
        }

        // Execute the query
        let tableData = cloneDeep(await collection.toArray());

        // Process nested queries
        for (const item of tableData) {
          for (const nestedTableName in tableQuery) {
            if (
              Object.prototype.hasOwnProperty.call(
                tableQuery,
                nestedTableName
              ) &&
              !nestedTableName.startsWith('$')
            ) {
              const nestedQuery = tableQuery[
                nestedTableName
              ] as QueryDirectives<z.infer<T[keyof T]>> & iQL<T>;
              const nestedResult = await this.#executeQuery(
                { [nestedTableName]: nestedQuery } as Q,
                tableName as keyof T,
                item._id
              );
              item[nestedTableName] = nestedResult[nestedTableName];
            }
          }
        }

        result[tableName as keyof Q] = tableData;
      }
    }

    return result;
  }
}
