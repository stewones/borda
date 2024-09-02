/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { Dexie, Table } from 'dexie';
import { singular } from 'pluralize';
import { bufferTime, Subject, tap } from 'rxjs';
import { z } from 'zod';

import { Document } from '@borda/client';

import { fetcher } from './fetcher';

export type InstantSchemaField = z.ZodTypeAny;

export type InstantSyncStatus = 'created' | 'updated' | 'deleted';
export interface iQLByDirective {
  $by: string;
}

export interface iQL<T, TKey, TInsertType> {
  [key: string]:
    | iQL<T, TKey, TInsertType>
    | Table<T, TKey, TInsertType>
    | iQLByDirective;
}

export interface InstantSyncResponseData {
  objectId: string;
  status: InstantSyncStatus;
  value: Document;
}

export type InstantSyncActivity = 'recent' | 'oldest';

export interface InstantSyncResponse {
  synced: string;
  collection: string;
  count: number;
  data: InstantSyncResponseData[];
  activity: InstantSyncActivity;
}

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
  #scheduler = new Subject<{
    collection: string;
    synced: string;
    activity: InstantSyncActivity;
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
  }) {
    this.#name = name;
    this.#schema = schema;
    this.#serverURL = serverURL || '';
    this.#inspect = inspect || false;
    this.#buffer = buffer || this.#buffer;
    this.#size = size || this.#size;
    this.#scheduler
      .pipe(
        bufferTime(this.#buffer),
        tap(async (collections) => {
          for (const { collection, activity, synced } of collections) {
            try {
              const perf = performance.now();
              const url = `${
                this.#serverURL
              }/sync/${collection}?activity=${activity}&synced=${synced}`;

              await this.runWorker({ url });

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
   * Sync paginated data from a given collection outside the main thread
   *
   * @returns Promise<void>
   */
  public async runWorker({ url }: { url: string }) {
    if (!this.#db) {
      await this.ready();
    }

    const { synced, collection, data, count, activity } =
      await fetcher<InstantSyncResponse>(url, {
        direct: true,
        method: 'GET',
        // @todo add headers
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
      });
    }

    return {
      collection,
      activity,
      synced,
    };
  }

  /**
   * Starts the sync process. Usually called after user login.
   * @todo maybe pass the user session in here along custom client-facing params
   *
   * @returns Promise<void>
   */
  public sync() {
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

    this.#syncBatch();
    this.#syncLive();
  }

  // @todo
  async #syncLive() {
    // const url = `${this.#serverURL}/instant/sync/live`;
    // const eventSource = new EventSource(url);
    // eventSource.onopen = () => {
    //   if (this.#inspect) {
    //     console.log('SSE connection opened');
    //   }
    // };
    // eventSource.onerror = (error: any) => {
    //   if (this.#inspect) {
    //     console.error('SSE error:', error);
    //   }
    // };
    // const listener = (eventSource.onmessage = async ({
    //   data,
    // }: {
    //   data: string;
    // }) => {
    //   const eventData = JSON.parse(data) as InstantSyncResponse;
    //   const { error, terminated } = eventData;
    //   // close
    //   if (terminated) {
    //     console.error('SSE connection terminated', error);
    //     eventSource.removeEventListener('message', listener);
    //     eventSource.close();
    //     return;
    //   }
    //   if (error) {
    //     console.error('SSE message error', error);
    //     return;
    //   }
    //   // process message
    //   if (this.#inspect) {
    //     console.log('SSE message', eventData);
    //   }
    //   await this.#syncProcess(eventData);
    // });
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

          if (sync.status !== 'complete') {
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

    this.#worker.postMessage(JSON.stringify({ url }));
  }

  async #syncProcess({
    collection,
    status,
    value,
  }: {
    collection: string;
    status: InstantSyncStatus;
    value: Document;
  }) {
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
   *     limit: 10,
   *     skip: 0,
   *     posts: {
   *       $by: 'author',
   *       limit: 10,
   *       skip: 0,
   *       sort: { rating: -1 },
   *       filter: {
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

    const executeQuery = async (
      queryObject: iQL<T, TKey, TInsertType>,
      parentTable?: string,
      parentId?: string
    ) => {
      const result: Record<string, T[]> = {};

      for (const tableName in queryObject) {
        if (Object.prototype.hasOwnProperty.call(queryObject, tableName)) {
          const tableQuery = queryObject[tableName];
          let tableData;

          const parentTableAsBy = parentTable
            ? singular(parentTable)
            : undefined;

          if (parentTable && parentId) {
            const pointerField = getPointerField(tableName, parentTable);

            if (pointerField) {
              tableData = await this.#db
                .table(tableName)
                .where(pointerField)
                .equals(pointerRef(parentTable, parentId))
                .toArray();
            } else if (parentTableAsBy) {
              // console.log('table', tableName);
              // console.log('where', parentTableAsBy);
              // console.log('equals', pointerRef(parentTable, parentId));
              tableData =
                (await this.#db
                  .table(tableName)
                  .where(parentTableAsBy)
                  .equals(pointerRef(parentTable, parentId))
                  .toArray()
                  .catch((err) => console.log(err))) || [];
            } else {
              tableData = [];
            }
          } else {
            tableData = await this.#db
              .table(tableName)
              .orderBy('_created_at')
              .reverse()
              .toArray();
          }

          if (Object.keys(tableQuery).length === 0) {
            result[tableName] = tableData;
          } else if ((tableQuery as iQLByDirective).$by) {
            // Handle $by directive
            const byField = (tableQuery as iQLByDirective).$by;

            const nestedData = await this.#db
              .table(tableName)
              .where(byField)
              .equals(pointerRef(parentTable!, parentId!))
              .toArray();

            result[tableName] = nestedData;
          } else {
            result[tableName] = await Promise.all(
              tableData.map(async (item) => {
                const nestedResult = await executeQuery(
                  tableQuery as iQL<T, TKey, TInsertType>,
                  tableName,
                  item._id
                );
                return { ...item, ...nestedResult };
              })
            );
          }
        }
      }

      return result;
    };

    return executeQuery(iql);
  }
}
