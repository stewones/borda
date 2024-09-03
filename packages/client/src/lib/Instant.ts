/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { Collection, Dexie, IndexableType, Table } from 'dexie';
import { singular } from 'pluralize';
import { bufferTime, Subject, tap } from 'rxjs';
import { z } from 'zod';

import { Document, isServer, WebSocketFactory } from '@borda/client';

import { fetcher } from './fetcher';

export type InstantSchemaField = z.ZodTypeAny;

export type InstantSyncStatus = 'created' | 'updated' | 'deleted';
export interface iQLByDirective {
  $by: string;
}
export interface iQLLimitDirective {
  $limit: number;
}

// export interface iQL<T, TKey, TInsertType> {
//   [key: string]:
//     | iQL<T, TKey, TInsertType>
//     | Table<T, TKey, TInsertType>
//     | iQLByDirective
//     | iQLLimitDirective;
// }

export interface InstantSyncResponseData {
  collection: string;
  status: InstantSyncStatus;
  value: Document;
  updatedFields?: Record<string, any>;
  removedFields?: string[];
  truncatedArrays?: Array<{
    /** The name of the truncated field. */
    field: string;
    /** The number of elements in the truncated array. */
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

// Define types for query directives
type SortDirection = 1 | -1;
type FilterCondition = { $exists?: boolean; $nin?: any[] };

interface QueryDirectives<T> {
  $limit?: number;
  $skip?: number;
  $sort?: { [K in keyof T]?: SortDirection };
  $filter?: { [K in keyof T]?: FilterCondition };
  $by?: string;
}

// Update the iQL type to include QueryDirectives
export type iQL<T, TKey, TInsertType> = {
  [K in keyof T]?: iQL<T[K], TKey, TInsertType> & QueryDirectives<T[K]>;
};

// Helper type to extract the document type from a Table
type TableDocument<T> = T extends Table<infer D, any, any> ? D : never;

export const objectId = <T extends string>(p: T) =>
  z.string().max(9).brand<T>();

export const objectPointer = <T extends string>(p: T) =>
  z
    .object({ collection: z.string().max(42), objectId: z.string().max(9) })
    .brand<T>();

/**
 * The returned string is a representation of the pointer
 * which identifies the collection and the objectId
 *
 * @example
 * const userId = pointerRef('users', 'a1b2c3');
 * // userId => 'users$a1b2c3'
 *
 * @param p - pointer
 * @param objectId - objectId
 * @returns string
 */
export const pointerRef = <T = typeof objectPointer>(
  collection: string,
  objectId: string
) => `${collection}$${objectId}` as T;

const SyncSchema = z.object({
  collection: z.string(),
  count: z.number(),
  synced: z.string(),
  activity: z.enum(['recent', 'oldest']),
  status: z.enum(['complete', 'incomplete']),
});

export class Instant {
  #size = 1_000;
  #buffer = 10_000;
  #name: string;
  #db!: Dexie;
  #worker!: Worker;
  #serverURL: string;
  #schema: Record<string, z.ZodObject<Record<string, InstantSchemaField>>>;
  #inspect: boolean;
  #token!: string;
  #headers!: Record<string, string>;
  #params!: Record<string, string>;

  #scheduler = new Subject<{
    collection: string;
    synced: string;
    activity: InstantSyncActivity;
    token: string;
    headers: Record<string, string>;
    params: Record<string, string>;
  }>();

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

  #wss: WebSocket | undefined;

  constructor({
    // @todo for isolated tests
    // db,
    // idb,
    // idbKeyRange,
    schema,
    name,
    serverURL,
    inspect,
    buffer,
    size,
    token,
    headers,
    params,
  }: {
    // @todo for isolated tests
    // db?: Dexie;
    // idb?: typeof indexedDB;
    // idbKeyRange?: typeof IDBKeyRange;
    name: Capitalize<string>;
    schema: Record<string, z.ZodObject<any>>;
    serverURL?: string | undefined;
    inspect?: boolean | undefined;
    buffer?: number | undefined;
    size?: number | undefined;
    token?: string;
    headers?: Record<string, string>;
    params?: Record<string, string>;
  }) {
    this.#name = name;
    this.#schema = schema;
    this.#serverURL = serverURL || '';
    this.#inspect = inspect || false;
    this.#buffer = buffer || this.#buffer;
    this.#size = size || this.#size;
    this.#token = token || '';
    this.#headers = headers || {};
    this.#params = params || {};
    this.#scheduler
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
              const perf = performance.now();
              const url = `${
                this.#serverURL
              }/sync/${collection}?activity=${activity}&synced=${synced}`;

              await this.runWorker({
                url,
                token,
                headers,
                params,
              });

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
              if (this.#inspect) {
                console.error('Error scheduling sync', err);
              }
            }
          }
        })
      )
      .subscribe();
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
          this.#schema[tableName].shape
        ).join(', ')}`;
      }

      const db = new Dexie(this.#name, {
        // @todo for isolated tests
        // indexedDB: idb,
        // IDBKeyRange: idbKeyRange,
      });

      // add internal schema
      dexieSchema['_sync'] = `[collection+activity], ${Object.keys(
        SyncSchema.shape
      ).join(', ')}`;

      db.version(1).stores(dexieSchema);
      this.#db = db;

      this.#db.on('ready', (db) => {
        Promise.resolve(db);
        if (this.#inspect && !isServer()) {
          // @ts-ignore
          window['insta'] = this;
        }
      });
    } catch (error) {
      console.error('Error initializing database', error);
      Promise.reject(error);
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

      return `${estimatedTotalMB ? (estimatedTotalMB * 1.8).toFixed(2) : 0} MB`;
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

    const { usageDetails } = estimate || {};
    const { indexedDB } = usageDetails || { indexedDB: 0 };
    const total = indexedDB / (1024 * 1024);

    return `${total.toFixed(2)} MB`;
  }

  public async useSync({
    collection,
    activity,
  }: {
    collection: string;
    activity: InstantSyncActivity;
  }) {
    return ((await this.#db
      .table('_sync')
      .where({ collection, activity })
      .first()) || {
      activity,
      synced: null,
      status: 'incomplete',
    }) as z.infer<typeof SyncSchema>;
  }

  public async setSync({
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
    const sync = await this.#db
      .table('_sync')
      .where({ collection, activity })
      .first();

    if (sync) {
      return this.#db
        .table('_sync')
        .where({ collection, activity })
        .modify({ collection, synced, count, status });
    }

    return this.#db
      .table('_sync')
      .put({ collection, activity, count, status, synced });
  }

  public setWorker({ worker }: { worker: Worker }) {
    this.#worker = worker;
    // this.#worker.onmessage = ({}) => {}; // no need for now
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

        const perf = performance.now();

        /**
         * run the worker, it should:
         * 1. fetch filtered and paginated data from the server
         * 2. update the local indexedDB
         * 3. keep syncing older and new data in background
         *
         * 🎉 the ui can just query against the local db instead
         * including realtime updates via dexie livequery
         */
        if (sync === 'batch') {
          const { collection, activity, synced } = await this.runWorker({
            url,
            token,
            headers,
            params,
          });

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

          // not needed for now
          // postMessage(JSON.stringify({ collection, page, synced }));
        }

        if (sync === 'live') {
          this.runLiveWorker({ url, token, headers, params });
        }
      } catch (err) {
        if (this.inspect) {
          console.error('Error running worker', err);
        }
      }
    };
  }

  /**
   * Sync paginated data from a given collection outside the main thread
   *
   * @returns Promise<void>
   */
  public async runWorker({
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
    if (!this.#db) {
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

    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );

    await this.#db.transaction('rw!', this.#db.table(collection), async () => {
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
      localCount = await this.#db
        .table(collection)
        .where('_updated_at')
        .belowOrEqual(synced)
        .count();
    } else {
      localCount = await this.#db
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
      await this.setSync({
        collection,
        activity,
        count,
        synced,
        status: 'complete',
      });
    } else {
      await this.setSync({ collection, activity, count, synced });
    }

    // schedule next sync
    // we skip this on mobile devices to avoid unecessary data consumption
    if (!isMobile && localCount < remoteCount) {
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
      this.#scheduler.next({
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
  public async runLiveWorker({
    url,
    token,
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

    if (token && !this.#token) {
      this.#token = token;
    }
    if (headers && !this.#headers) {
      this.#headers = headers;
    }
    if (params && !this.#params) {
      this.#params = params;
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
      url += `&${new URLSearchParams(finalParams).toString()}`;
    }

    const webSocket: WebSocketFactory = {
      onOpen: (ws) => {
        this.#wss = ws;
        wssConnected = true;
        if (this.#inspect) {
          console.log('🟡 sync live worker open');
        }
      },

      onError: (ws, err) => {
        if (this.#inspect) {
          console.log('🔴 sync live worker error', err);
        }
      },

      onConnect: (ws) => {
        hasConnected = true;
        if (this.#inspect) {
          console.log('🟢 sync live worker connected');
        }
        // we just need the connection to be open
        // ws.send(JSON.stringify(body));
      },

      onMessage: async (ws: WebSocket, message: MessageEvent) => {
        const { collection, status, value } = JSON.parse(
          message.data || '{}'
        ) as InstantSyncResponseData;

        if (this.#inspect) {
          console.log('🔵 sync live worker message', message.data);
        }

        await this.#syncProcess({
          collection,
          status,
          value,
        });

        // update last sync
        const synced = value['_updated_at'];
        await this.setSync({
          collection,
          activity: 'recent',
          synced,
          count: 0,
        });
      },

      onClose: (ws, ev) => {
        if (this.inspect) {
          console.log('🟣 sync live worker closed', ev.code);
        }

        // 1000 is a normal close, so we can safely close on it
        if (wssFinished || ev?.code === 1000 || !hasConnected) {
          if (this.#inspect) {
            console.log('🔴 closing websocket', ev.code);
          }
          this.#wss?.close();
          return;
        }

        if (wssConnected) {
          wssConnected = false;
          this.#wss?.close();
          if (this.inspect) {
            // code 1006 means the connection was closed abnormally (eg Cloudflare timeout)
            // locally it also happens on server hot reloads
            console.log('🔴 sync live worker disconnected', ev.code);
          }
        }

        setTimeout(() => {
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

  /**
   * Starts the sync process. Usually called after user login.
   * @todo maybe pass the user session in here along custom client-facing params
   *
   * @returns Promise<void>
   */
  public sync({
    session,
    headers,
    params,
  }: {
    session: string;
    headers?: Record<string, string>;
    params?: Record<string, string>;
  }) {
    if (!this.#db) {
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
    this.#headers = headers || {};
    this.#params = params || {};

    this.#syncBatch();
    this.#syncLive();
  }

  async #syncLive() {
    const url = `${this.#serverURL}/sync/live?session=${this.#token}`;
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

  async #syncBatch() {
    try {
      const collections = Object.keys(this.#schema);

      for (const collection of collections) {
        for (const activity of ['oldest', 'recent'] as const) {
          const sync = await this.useSync({
            collection,
            activity,
          });

          if (activity === 'recent' && !sync.synced) {
            // try to get the most recent _updated_at from the local db
            const mostRecentUpdatedAt = await this.#db
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
            await this.#syncWorker({
              collection,
              synced: sync.synced,
              activity,
            });
          }
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

    this.#worker.postMessage(
      JSON.stringify({
        url,
        sync: 'batch',
        token: this.#token,
        headers: this.#headers,
        params: this.#params,
      })
    );
  }

  async #syncProcess({ collection, status, value }: InstantSyncResponseData) {
    const persist: Record<
      InstantSyncStatus,
      (collection: string, value: Document) => Promise<void>
    > = {
      created: async (collection: string, value: Document) => {
        await this.#db
          .table(collection)
          .add(value)
          .catch((err) => {
            if (this.#inspect) {
              console.error('Error adding document', collection, value, err);
            }
          });
      },
      updated: async (collection: string, value: Document) => {
        await this.#db
          .table(collection)
          .update(value['_id'], value as object)
          .catch((err) => {
            if (this.#inspect) {
              console.error('Error updating document', collection, value, err);
            }
          });
      },
      deleted: async (collection: string, value: Document) => {
        await this.#db
          .table(collection)
          .delete(value['_id'])
          .catch((err) => {
            if (this.#inspect) {
              console.error('Error deleting document', collection, value, err);
            }
          });
      },
    };
    await persist[status](collection, value);
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

  /**
   * @todo @experimental
   * WIP: query syntax based on a graph of collections
   * so we can have easy access to nested data, while keeping
   * the mongodb query syntax which is then translated to dexie
   *
   * server should follow the same pattern so we can have
   * the same query for both client and server
   *
   * @example
   * const query = {
   *   users: {
   *     $limit: 10,
   *     $skip: 0,
   *     posts: {
   *       $by: 'author',
   *       $limit: 10,
   *       $skip: 0,
   *       $sort: { rating: -1 },
   *       $filter: {
   *         title: { $exists: true },
   *         status: { $nin: ['draft', 'archived'] },
   *       },
   *     },
   *   },
   * }
   */
  public async query<T, TKey, TInsertType>(iql: iQL<T, TKey, TInsertType>) {
    // ... existing code ...
    const getPointerField = (
      childTable: string,
      parentTable: string
    ): string | undefined => {
      const childSchema = this.#schema[childTable];
      if (!childSchema) return undefined;

      for (const [fieldName, fieldSchema] of Object.entries(
        childSchema.shape
      )) {
        if (
          fieldSchema instanceof z.ZodBranded &&
          fieldSchema._def.type instanceof z.ZodObject
        ) {
          const innerShape = fieldSchema._def.type.shape;
          if (
            innerShape.collection instanceof z.ZodLiteral &&
            innerShape.collection._def.value === parentTable
          ) {
            return fieldName;
          }
        }
      }

      return undefined;
    };

    const executeQuery = async <T extends Record<string, Table<any, any, any>>>(
      queryObject: iQL<T, any, any>,
      parentTable?: string,
      parentId?: string
    ): Promise<Partial<{ [K in keyof T]: TableDocument<T[K]>[] }>> => {
      const result: Partial<{ [K in keyof T]: TableDocument<T[K]>[] }> = {};

      for (const tableName in queryObject) {
        if (
          Object.prototype.hasOwnProperty.call(queryObject, tableName) &&
          !tableName.startsWith('$')
        ) {
          const table = this.#db.table(tableName);
          const tableQuery = queryObject[tableName] as QueryDirectives<
            TableDocument<T[typeof tableName]>
          > &
            iQL<T, any, any>;

          let collection: Collection<
            TableDocument<T[typeof tableName]>,
            IndexableType
          > = table as unknown as Collection<
            TableDocument<T[typeof tableName]>,
            IndexableType
          >;

          // Handle parent relationship
          if (parentTable && parentId) {
            const pointerField = getPointerField(tableName, parentTable);
            const parentTableAsBy = `_p_${singular(parentTable)}`;

            if (pointerField) {
              collection = collection.filter(
                (item) =>
                  item[pointerField] === pointerRef(parentTable, parentId)
              );
            } else if (parentTableAsBy) {
              collection = collection.filter(
                (item) =>
                  item[parentTableAsBy] === pointerRef(parentTable, parentId)
              );
            }
          }

          // Apply $filter
          if (tableQuery.$filter) {
            for (const [field, condition] of Object.entries(
              tableQuery.$filter ?? {}
            )) {
              if (condition?.$exists) {
                collection = collection.filter((item) => item[field] != null);
              }
              if (condition?.$nin) {
                collection = collection.filter(
                  (item) => !(condition.$nin ?? []).includes(item[field])
                );
              }
            }
          }

          // Apply $sort
          if (tableQuery.$sort) {
            const [field, order] = Object.entries(tableQuery.$sort)[0];
            collection = (collection as any).orderBy(field);
            if (order === -1) {
              collection = collection.reverse();
            }
          }

          // Apply $skip and $limit
          if (tableQuery.$skip) {
            collection = collection.offset(tableQuery.$skip);
          }
          if (tableQuery.$limit) {
            collection = collection.limit(tableQuery.$limit);
          }

          // Execute the query
          let tableData = await collection.toArray();

          // Process nested queries
          (result as any)[tableName] = await Promise.all(
            tableData.map(async (item) => {
              const nestedResult = await executeQuery(
                tableQuery as iQL<T, any, any>,
                tableName,
                item._id
              );
              return { ...item, ...nestedResult };
            })
          );
        }
      }

      return result;
    };
    return executeQuery(iql);
  }
}
