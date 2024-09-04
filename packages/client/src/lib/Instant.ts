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

// Helper type to extract the document type from a Table
type TableDocument<T> = T extends Table<infer D, any, any> ? D : never;

type SchemaType = Record<string, z.ZodType<any, any, any>>;

type InferSchemaType<T extends SchemaType> = {
  [K in keyof T]: z.infer<T[K]>;
};

type QueryDirectives<T> = {
  $limit?: number;
  $skip?: number;
  $sort?: { [K in keyof T]?: 1 | -1 };
  $filter?: {
    [K in keyof T]?: { $exists?: boolean; $nin?: any[] };
  };
  $by?: string;
};

export type iQL<T extends SchemaType, K extends keyof T = keyof T> = {
  [P in K]?: iQL<T, K> & QueryDirectives<z.infer<T[P]>>;
};

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

export class Instant<T extends SchemaType> {
  #size = 1_000;
  #buffer = 10_000;
  #name: string;
  #db!: Dexie;
  #worker!: Worker;
  #serverURL: string;
  #schema: T;
  #index!: Partial<Record<keyof T, string[]>>;
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
    index,
  }: {
    // @todo for isolated tests
    // db?: Dexie;
    // idb?: typeof indexedDB;
    // idbKeyRange?: typeof IDBKeyRange;
    name: Capitalize<string>;
    schema: T;
    index?: Partial<Record<keyof T, string[]>>;
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
    this.#index = index || {};
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
        // Add custom indices
        const customFields = this.#index[tableName] || [];

        // Generate all possible index combinations
        const indexCombinations = this.#generateIndexCombinations(customFields);

        // Join all index combinations
        const customIndices = indexCombinations.join(', ');

        dexieSchema[tableName] += `, ${customIndices}`;

        // console.log(dexieSchema[tableName]);
      }

      // add internal schema
      dexieSchema['_sync'] = `[collection+activity], ${Object.keys(
        SyncSchema.shape
      ).join(', ')}`;

      const db = new Dexie(this.#name, {
        // @todo for isolated tests
        // indexedDB: idb,
        // IDBKeyRange: idbKeyRange,
      });

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

  #generateIndexCombinations(fields: string[]): string[] {
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
      const combs = this.#combinations(fields, i);
      for (const comb of combs) {
        const perms = permute(comb);
        for (const perm of perms) {
          combo.push(`[${perm.join('+')}]`);
        }
      }
    }

    return [...new Set(combo)]; // Remove any duplicates
  }

  #combinations(arr: string[], k: number): string[][] {
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

  public async query<Q extends iQL<T>>(
    iql: Q
  ): Promise<{
    [K in keyof Q]: z.infer<T[K & keyof T]>[];
  }> {
    const getPointerField = (
      childTable: keyof T,
      parentTable: keyof T
    ): string | undefined => {
      const childSchema = this.#schema[childTable];
      if (!childSchema || !('shape' in childSchema)) return undefined;

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
    };

    const executeQuery = async <Q extends iQL<T>>(
      queryObject: Q,
      parentTable?: keyof T,
      parentId?: string
    ): Promise<{
      [K in keyof Q]: z.infer<T[K & keyof T]>[];
    }> => {
      const result = {} as {
        [K in keyof Q]: z.infer<T[K & keyof T]>[];
      };

      for (const tableName in queryObject) {
        if (
          Object.prototype.hasOwnProperty.call(queryObject, tableName) &&
          !tableName.startsWith('$')
        ) {
          const table = this.#db.table(tableName);
          const tableQuery = queryObject[tableName] as QueryDirectives<
            z.infer<T[keyof T]>
          > &
            iQL<T>;

          let collection: Collection<
            z.infer<T[keyof T]>,
            IndexableType
          > = table as unknown as Collection<
            z.infer<T[keyof T]>,
            IndexableType
          >;

          // Handle parent relationship
          if (parentTable && parentId) {
            const pointerField = getPointerField(
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
                  item[parentTableAsBy] ===
                  `${parentTable as string}$${parentId}`
              );
            }
          }

          // Apply $filter
          if (tableQuery.$filter) {
            for (const [field, condition] of Object.entries(
              tableQuery.$filter
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
          if (tableQuery.$sort && Object.keys(tableQuery.$sort).length > 0) {
            const sortFields = Object.entries(tableQuery.$sort);

            // Construct the compound index string with brackets
            const indexString = `[${sortFields
              .map(([field, _]) => field)
              .join('+')}]`;

            // console.log(indexString);

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
          result[tableName as keyof Q] = await Promise.all(
            tableData.map(async (item) => {
              const nestedResult = await executeQuery(
                tableQuery as Q,
                tableName as keyof T,
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

  /**
   * @todo @experimental
   * WIP: query syntax based on a graph of collections
   * so we can easily count nested data, while keeping
   * the mongodb query syntax which is then translated to dexie
   *
   * server should follow the same pattern so we can have
   * the same query for both client and server
   *
   * @example
   * const count = await insta.count('users', {
   *     $filter: {
   *       name: { $exists: true },
   *     },
   * });
   *
   * // console.log(count)
   * // 1337
   *
   */
  public async count(
    collection: string,
    query: Exclude<QueryDirectives<z.infer<T[keyof T]>>, '$by'> & iQL<T>
  ) {
    let table = this.#db.table(collection);
    const tableQuery = query as QueryDirectives<z.infer<T[keyof T]>> & iQL<T>;

    // Apply $filter
    if (tableQuery.$filter) {
      for (const [field, condition] of Object.entries(tableQuery.$filter)) {
        if (condition?.$exists) {
          table = table.filter(
            (item) => item[field] != null
          ) as unknown as Table<any, IndexableType>;
        }
        if (condition?.$nin) {
          table = table.filter(
            (item) => !(condition.$nin ?? []).includes(item[field])
          ) as unknown as Table<any, IndexableType>;
        }
      }
    }

    return table.count();
  }
}
