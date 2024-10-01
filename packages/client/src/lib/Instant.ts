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
  filter,
  from,
  fromEvent,
  interval,
  map,
  merge,
  startWith,
  Subject,
  Subscription,
  takeUntil,
  tap,
} from 'rxjs';
import { z } from 'zod';

import { fetcher } from './fetcher';
import { Document } from './types';
import {
  cloneDeep,
  guid,
  isServer,
} from './utils';
import { WebSocketFactory } from './websocket';

type SchemaType = Record<string, z.ZodType<any, any, any>>;

export interface InstaError<
  CloudSchema extends {
    headers: SchemaType;
    body: SchemaType;
    response: SchemaType;
  } = {
    headers: Record<string, never>;
    body: Record<string, never>;
    response: Record<string, never>;
  }
> {
  status: number;
  type: InstaErrorType;
  message: string;
  summary: string;
  errors: {
    path: string;
    message: string;
  }[];
  fn?: keyof CloudSchema['body'];
}

export type InstaErrorType =
  | 'validation_error'
  | 'unauthorized'
  | 'not_found'
  | 'internal_server_error'
  | 'bad_headers'
  | 'bad_request'
  | 'bad_response';

/**
 * A subset of Dexie's query language, inspired by MongoDB query style.
 * This interface allows for strongly-typed queries based on the provided schema.
 *
 * @example
 * const schema = {
 *   users: z.object({
 *     name: z.string().min(3),
 *     age: z.number(),
 *   }),
 * }
 *
 * const query: iQL<typeof schema> = {
 *   users: {
 *     $filter: {
 *       name: { $regex: 'John' },
 *       age: { $gt: 18 }
 *     },
 *     $sort: { age: -1 },
 *     $limit: 10
 *   }
 * }
 */
export type iQL<T extends SchemaType, K extends keyof T = keyof T> = {
  [P in K]?: iQL<T, K> & iQLDirectives<z.infer<T[P]>>;
};

export type iQLFilterCondition<T> =
  | {
      $exists?: boolean;
      $nin?: any[];
      $regex?: string;
      $options?: string;
      $eq?: any;
    }
  | ((item: T) => boolean);

export type iQLDirectives<T> = {
  $limit?: number;
  $skip?: number;
  $sort?: { [K in keyof T]?: number };
  $filter?:
    | {
        [K in keyof T]?: iQLFilterCondition<T>;
      }
    | ((item: T) => boolean);
  $or?: Array<{ [K in keyof T]?: iQLFilterCondition<T> | T }>;
  $by?: string;
};

export type SyncStatus = 'created' | 'updated' | 'deleted';
export type SyncActivity = 'recent' | 'oldest';

export interface SyncResponseData {
  status: SyncStatus;
  value: Document;
  collection?: string;
  updatedFields?: Record<string, any>;
  removedFields?: string[];
  truncatedArrays?: Array<{
    field: string;
    newSize: number;
  }>;
}

export interface SyncResponse {
  synced_at: string;
  collection: string;
  count: number;
  data: SyncResponseData[];
  activity: SyncActivity;
}

export const ejectPointerId = (pointer: string) => {
  return pointer.split('$')[1];
};

export const ejectPointerCollection = (pointer: string) => {
  return pointer.split('$')[0];
};

export const createObjectIdSchema = <T extends string>(p: T) =>
  z.string().min(9).max(36).brand<T>();

export const createPointerSchema = (collection: string) =>
  z.string().brand<string>(collection).describe('pointer');

export const createSchema = <S extends SchemaType>(
  collection: string,
  schema: S
) =>
  z
    .object({
      // _id: createObjectIdSchema(collection),
      _id: z.string(),
      _uuid: z.string().length(36).optional(),
      _sync: z.number().optional(),
      _created_at: z.union([z.string().optional(), z.date().optional()]),
      _updated_at: z.union([z.string().optional(), z.date().optional()]),
      _expires_at: z.union([z.string().optional(), z.date().optional()]),
      _created_by: z.string().optional(),
      _updated_by: z.string().optional(),
      _deleted_by: z.string().optional(),
      _updated_fields: z.record(z.any()).optional(),
      ...schema,
    })
    .describe(
      JSON.stringify({
        sync: true,
      })
    );

export const withOptions = <T extends z.ZodType<any, any, any>>(
  schema: T,
  options:
    | {
        sync?: boolean;
        public?: never;
        description?: string;
      }
    | {
        sync?: never;
        public?: boolean;
        description?: string;
      }
) => {
  return schema.describe(JSON.stringify(options));
};

/**
 * A string representation of the pointer
 * which identifies the collection and the document id
 *
 * @example
 * const userId = createPointer('users', 'a1b2c3');
 * // userId => 'users$a1b2c3'
 */
export const createPointer = (collection: string, id: string) => {
  return `${collection}$${id}`;
};

export const createError = (
  status: number,
  type: InstaError['type'],
  message: InstaError['message'],
  summary: InstaError['summary'],
  errors: InstaError['errors'] = [],
  {
    fn = '',
  }: {
    fn?: InstaError['fn'];
  } = {}
) => {
  return {
    status,
    type,
    message,
    summary,
    errors,
    fn,
  } as InstaError;
};

const InstaSyncSchema = z.object({
  collection: z.string(),
  count: z.number(),
  synced_at: z.string(),
  activity: z.enum(['recent', 'oldest']),
  status: z.enum(['complete', 'incomplete']),
});

export const InstaCacheSchema = z.object({
  key: z.string(),
  value: z.any(),
});

export const InstaUserEmailSchema = z.string().email('Invalid email address');

export const InstaUserPasswordSchema = z
  .string()
  .min(8, 'Password must have a minimum length of 8 chars')
  .max(64, 'Password must have a maximum length of 64 chars')
  .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Password should have at least one symbol')
  .regex(/[A-Z]/, 'Password should have uppercase letters')
  .regex(/[a-z]/, 'Password should have lowercase letters')
  .regex(/\d{2,}/, 'Password must have at least 2 numbers')
  .refine((value) => !/\s/.test(value), 'Password must not have spaces')
  .refine(
    (value) => !['Passw0rd', 'Password123'].includes(value),
    'Password cannot be a common password'
  );

export const InstaUserSchema = withOptions(
  createSchema('users', {
    name: z.string().min(3, 'Name must have a minimum length of 3 chars'),
    email: InstaUserEmailSchema,
    _password: withOptions(InstaUserPasswordSchema.optional(), {
      sync: false,
    }),
  }),
  {
    sync: true,
  }
);

export const InstaSessionSchema = createSchema('sessions', {
  _p_user: z.string(),
  token: z.string(),
  user: InstaUserSchema, // runtime
});

export type InstaUser = z.infer<typeof InstaUserSchema>;
export type InstaSession = z.infer<typeof InstaSessionSchema>;

const isMobile =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );

export class Instant<
  CollectionSchema extends SchemaType,
  CloudSchema extends {
    headers: SchemaType;
    body: SchemaType;
    response: SchemaType;
  } = {
    headers: Record<string, never>;
    body: Record<string, never>;
    response: Record<string, never>;
  },
  CacheSchema extends SchemaType = Record<string, never>
> {
  public online = merge(
    fromEvent(!isServer() ? window : new EventTarget(), 'online').pipe(
      map(() => true)
    ),
    fromEvent(!isServer() ? window : new EventTarget(), 'offline').pipe(
      map(() => false)
    )
  ).pipe(startWith(navigator.onLine), distinctUntilChanged());

  public syncing = (collection?: keyof CollectionSchema) =>
    from(liveQuery(() => this.db.table('_sync').toArray())).pipe(
      map((activities) => {
        const filteredActivities = collection
          ? activities.filter((item) => item.collection === collection)
          : activities;
        return (
          filteredActivities.some(
            (item) => item.activity === 'oldest' && item.status === 'incomplete'
          ) && navigator.onLine
        );
      }),
      startWith(false),
      distinctUntilChanged()
    );

  public errors = new Subject<InstaError<CloudSchema>>();

  protected wss: WebSocket | undefined;

  #size = 1_000;
  #buffer = 10_000;
  #name: string;
  #version: number;
  #db!: Dexie;
  #worker!: Worker;
  #serverURL: string;
  #schema: CollectionSchema;
  #cache!: CacheSchema;
  #collections: string[] = [];
  #index!: Partial<Record<keyof CollectionSchema, string[]>>;
  #inspect: boolean;
  #session?: InstaSession;
  #headers!: Record<string, string>;
  #params!: Record<string, string>;
  #pendingTasks: Subscription | undefined;
  #pendingPointersBusy = false;
  #pendingMutationsBusy = false;
  #destroyed: Subject<void> = new Subject();
  #batch!: Subject<{
    collection: string;
    synced_at: string;
    activity: SyncActivity;
    token: string;
    headers: Record<string, string>;
    params: Record<string, string>;
  }>;

  #been_offline = false;
  #online = this.online
    .pipe(
      tap((isOnline) => {
        if (isOnline && this.#been_offline && this.token) {
          this.syncBatch('recent');
          this.syncBatch('oldest');
          this.recordActivity();
          /* istanbul ignore next */
          if (this.#inspect) {
            console.log('🟢 client is online');
          }
        }
      }),
      tap((isOnline) => (this.#been_offline = !isOnline))
    )
    .subscribe();

  private lastActivityTimestamp: number = Date.now();
  private inactivityThreshold: number = 10 * 1000;
  private schedulerSubscription: Subscription | null = null;

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

  get token() {
    return this.#session?.token || '';
  }

  get user() {
    return this.#session?.user?._id || '';
  }

  get collections() {
    return this.#collections;
  }

  constructor({
    name,
    schema,
    cache,
    version = 1,
    serverURL,
    inspect,
    buffer,
    size,
    headers,
    params,
    index,
  }: {
    name: string;
    version?: number;
    schema: CollectionSchema;
    cloud?: CloudSchema;
    cache?: CacheSchema;
    index?: Partial<Record<keyof CollectionSchema, string[]>>;
    serverURL: string;
    inspect?: boolean | undefined;
    buffer?: number | undefined;
    size?: number | undefined;
    token?: string;
    headers?: Record<string, string>;
    params?: Record<string, string>;
  }) {
    this.#name = name;
    this.#schema = schema;
    this.#cache = cache || ({} as CacheSchema);
    this.#version = version;
    this.#serverURL = serverURL;
    this.#inspect = inspect || false;
    this.#buffer = buffer || this.#buffer;
    this.#size = size || this.#size;
    this.#headers = headers || {};
    this.#params = params || {};
    this.#index = index || {};
    this.#collections = Object.keys(schema).filter((key) => {
      try {
        const item = schema[key];
        const options = JSON.parse(item.description || '{}');
        return options.sync;
      } catch (error) {
        return false;
      }
    });
  }

  async #useSync({
    collection,
    activity,
  }: {
    collection: string;
    activity: SyncActivity;
  }) {
    return ((await this.db
      .table('_sync')
      .where({ collection, activity })
      .first()) || {
      activity,
      synced_at: null,
      status: 'incomplete',
    }) as z.infer<typeof InstaSyncSchema>;
  }

  async #setSync({
    collection,
    synced_at,
    activity,
    count,
    status = 'incomplete',
  }: {
    collection: string;
    synced_at: string;
    activity: SyncActivity;
    count: number;
    status?: 'complete' | 'incomplete';
  }) {
    const sync = await this.db
      .table('_sync')
      .where({ collection, activity })
      .first();

    const payload = { collection, synced_at, count, status };

    if (sync) {
      return this.db
        .table('_sync')
        .where({ collection, activity })
        .modify(payload);
    }

    return this.db.table('_sync').put({ ...payload, activity });
  }

  async #syncProcess({
    collection,
    status,
    value,
    updatedFields,
  }: {
    collection: string;
    status: SyncStatus;
    value: Document;
    updatedFields?: Record<string, any>;
  }) {
    const persist: Record<
      SyncStatus,
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
            .catch(
              /* istanbul ignore next */
              (err) => {
                if (this.#inspect) {
                  console.error(
                    'Error updating document',
                    collection,
                    value,
                    err
                  );
                }
              }
            );
        }
      },
      deleted: async (collection: string, value: Document) => {
        await this.db
          .table(collection)
          .delete(value['_id'])
          .catch(
            /* istanbul ignore next */
            (err) => {
              if (this.#inspect) {
                console.error(
                  'Error deleting document',
                  collection,
                  value,
                  err
                );
              }
            }
          );
      },
    };
    await persist[status](collection, value, updatedFields);
  }

  protected buildWebSocket(url: string) {
    return (factory: WebSocketFactory) => {
      const { onConnect, onOpen, onError, onClose, onMessage } = factory;
      const ws = new WebSocket(url);

      /* istanbul ignore next */
      ws.onmessage = (ev: MessageEvent) => onMessage(ws, ev);
      ws.onopen = (ev: Event) => onOpen(ws, ev);
      ws.onerror = (err: Event) => onError(ws, err);
      ws.onclose = (ev: CloseEvent) => onClose(ws, ev);

      const timer = setInterval(() => {
        if (ws.readyState === 1) {
          clearInterval(timer);
          onConnect(ws);
        }
      }, 1);
    };
  }

  protected keepSyncing({
    collection,
    synced_at,
    activity,
    token,
    headers,
    params,
  }: {
    collection: string;
    synced_at: string;
    activity: SyncActivity;
    token: string;
    headers: Record<string, string>;
    params: Record<string, string>;
  }) {
    this.#batch.next({
      collection,
      synced_at,
      activity,
      token,
      headers,
      params,
    });
  }

  protected async runPendingMutations() {
    if (this.#pendingMutationsBusy) return;

    this.#pendingMutationsBusy = true;
    try {
      const collections = this.collections;
      const batchSize = 100; // Adjust based on your needs

      for (const collection of collections) {
        let hasMore = true;
        while (hasMore) {
          const query = {
            [collection as keyof CollectionSchema]: {
              $filter: { _sync: { $eq: 1 } },
              $limit: batchSize,
            },
          };

          const pending = await this.query(
            query as unknown as iQL<CollectionSchema>
          );

          const data = pending[collection as keyof CollectionSchema];

          if (data.length === 0) {
            if (this.#inspect) {
              console.log('👀 no mutations to sync', collection);
            }
            hasMore = false;
            continue;
          } else {
            if (this.#inspect) {
              console.log('🔵 mutations to sync', collection, data.length);
            }
          }

          // Process the batch
          await Promise.all(
            data.map((item) => this.processMutation(collection, item))
          );
        }
      }
    } catch (error) {
      this.errors.next(error as InstaError<CloudSchema>);
      if (this.#inspect)
        console.error('Error while running pending mutations', error);
    } finally {
      this.#pendingMutationsBusy = false;
    }
  }

  protected async processMutation(collection: string, item: Document) {
    // check for validation, if fails, skip
    const validation = this.validate(collection, item);
    const { type, message, summary, errors } = validation;
    if (errors) {
      // skip from syncing
      await this.db.table(collection).update(item['_id'], {
        _sync: 0,
      });

      // post errors to the client
      self.postMessage({
        validation,
      });

      /* istanbul ignore next */
      if (this.#inspect) {
        console.error('❌ validation failed', type, message, summary, errors);
      }
      return;
    }

    let url = `${this.#serverURL}/sync/${collection}`;

    const token = this.token;
    const headers = this.#headers;
    const params = this.#params;
    let method: 'DELETE' | 'PUT' | 'POST' = item['_expires_at']
      ? 'DELETE'
      : item['_created_at'] !== item['_updated_at']
      ? 'PUT'
      : 'POST';

    if (['DELETE', 'PUT'].includes(method)) {
      url += `/${item['_id']}`;
    }

    // if data has no server id yet
    // we need to make sure this is a POST operation
    if (item['_id'].includes('-')) {
      method = 'POST';
      url = `${this.#serverURL}/sync/${collection}`;
    }

    // updated data should be restricted to only updated fields
    const data =
      method === 'PUT'
        ? item['_updated_fields']
        : method === 'POST'
        ? { ...item, _updated_fields: undefined }
        : {};

    await this.runMutationWorker({
      collection,
      url,
      data,
      method,
      token,
      headers,
      params,
      id: item['_id'],
    }).catch((err) => {
      if (this.#inspect) {
        console.error('❌ error while running mutation worker', err);
      }
      // post error to the client
      self.postMessage({
        validation: err,
      });
    });

    if (data.length > 0) {
      /* istanbul ignore next */
      if (this.#inspect) {
        console.log('🔵 pending mutations', collection, method, data);
      }
    }
  }

  protected async runPendingPointers() {
    if (this.#pendingPointersBusy) {
      return;
    }

    this.#pendingPointersBusy = true;

    const collections = this.collections;

    for (const collection of collections) {
      // check for pointers using uuid
      const query = {
        [collection as keyof CollectionSchema]: {
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
      const pending = await this.query(
        query as unknown as iQL<CollectionSchema>
      );
      const data = pending[collection as keyof CollectionSchema];

      for (const item of data) {
        const pointers = Object.entries(item).filter(
          ([key, value]) =>
            key.startsWith('_p_') &&
            typeof value === 'string' &&
            value.includes('-')
        );

        // loop through all pointers containing uuid and update the item with the pointer data
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
          } as unknown as iQL<CollectionSchema>);

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
  protected async runBatchWorker({
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

    const { synced_at, collection, data, count, activity } =
      await fetcher<SyncResponse>(url, {
        direct: true,
        method: 'GET',
        headers: {
          authorization: `Bearer ${token}`,
          ...headers,
          // ['x-timezone']: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });

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
        .belowOrEqual(synced_at)
        .count();
    } else {
      localCount = await this.db
        .table(collection)
        .where('_created_at')
        .aboveOrEqual(synced_at)
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
        synced_at,
        status: 'complete',
      });
    } else {
      await this.#setSync({ collection, activity, count, synced_at });
    }

    // schedule next sync
    if (localCount < remoteCount) {
      if (!this.token) {
        return {
          collection,
          activity,
          synced_at,
        };
      }
      /* istanbul ignore next */
      if (this.#inspect) {
        console.log(
          '⏰ scheduling next sync in',
          this.#buffer,
          'for',
          collection,
          activity,
          synced_at
        );
      }

      this.keepSyncing({
        collection,
        synced_at,
        activity,
        token,
        headers,
        params,
      });
    }

    return {
      collection,
      activity,
      synced_at,
    };
  }

  /**
   * Open a websocket connection to the server
   * and keep live data in sync with local db
   *
   * @returns void
   */
  protected async runLiveWorker({
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
        this.wss = ws;
        wssConnected = true;
        /* istanbul ignore next */
        if (this.#inspect) {
          console.log('🟡 sync live worker open');
        }
      },

      /* istanbul ignore next */
      onError: (_, err) => {
        /* istanbul ignore next */
        if (this.#inspect) {
          console.log('🔴 sync live worker error', err);
        }
      },

      onConnect: (_) => {
        hasConnected = true;
        /* istanbul ignore next */
        if (this.#inspect) {
          console.log('🟢 sync live worker connected');
        }
      },

      onMessage: async (_, message: MessageEvent) => {
        const { collection, status, value, updatedFields } = JSON.parse(
          message.data
        ) as {
          collection: string;
          status: SyncStatus;
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
                  async () =>
                    await Promise.allSettled([
                      // gotta delete the old doc and create new one with server timestamp
                      this.db.table(collection as string).delete(uuid),
                      // create new one with updated stuff
                      this.db.table(collection as string).add({
                        ...value,
                        _sync: 0, // to make sure response is marked as synced
                      }),
                    ])
                );
              } else {
                await this.db.table(collection as string).add({
                  ...value,
                  _sync: 0, // to make sure response is marked as synced
                });
              }
            } else {
              await this.db.table(collection as string).add({
                ...value,
                _sync: 0, // to make sure response is marked as synced
              });
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
          const synced_at = value['_updated_at'];
          await this.#setSync({
            collection,
            activity: 'recent',
            synced_at,
            count: 0,
          });
        } catch (err) {
          /* istanbul ignore next */
          if (this.#inspect) {
            console.log('🔴 live mutation failed', collection, value, err);
          }
        }
      },

      onClose: (_, ev) => {
        /* istanbul ignore next */
        if (this.inspect) {
          console.log('🟣 sync live worker closed', ev.code);
        }

        // 1000 is a normal close, so we can safely close on it
        if (wssFinished || ev.code === 1000 || !hasConnected) {
          /* istanbul ignore next */
          if (this.#inspect) {
            console.log('🔴 closing websocket', ev.code);
          }

          this.wss?.close();
          return;
        }

        if (wssConnected) {
          wssConnected = false;
          /* istanbul ignore next */
          this.wss?.close();
          /* istanbul ignore next */
          if (this.inspect) {
            // code 1006 means the connection was closed abnormally (eg Cloudflare timeout)
            // locally it also happens on server hot reloads
            console.log('🔴 sync live worker disconnected', ev.code);
          }
        }

        // Implement exponential backoff for reconnection
        let retryDelay = 1000;
        const maxRetryDelay = 30000;
        const retry = () => {
          if (this.#destroyed.isStopped) return;

          retryDelay = Math.min(retryDelay * 2, maxRetryDelay);
          setTimeout(() => {
            if (this.inspect) {
              console.log('🟡 sync live worker on retry');
            }
            this.buildWebSocket(url)(webSocket);
          }, retryDelay);
        };
        retry();

        // retry
        // setTimeout(() => {
        //   /* istanbul ignore next */
        //   if (this.inspect) {
        //     console.log('🟡 sync live worker on retry');
        //   }
        //   this.buildWebSocket(url)(webSocket);
        // }, 1_000);
      },
    };

    /**
     * connect to the server
     */
    this.buildWebSocket(url)(webSocket);
  }

  protected async runMutationWorker({
    collection,
    url,
    data,
    token,
    headers,
    params,
    method,
    id,
  }: {
    collection: string;
    url: string;
    method: 'POST' | 'PUT' | 'DELETE';
    data: Document;
    token?: string;
    headers?: Record<string, string>;
    params?: Record<string, string>;
    id?: string;
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
      await this.db.table(collection).update(id, {
        _sync: 0,
      });
    } catch (err: any) {
      /* istanbul ignore next */
      if (this.#inspect) {
        console.error('🔴 Error mutating document', collection, data, err);
      }

      // skip from syncing
      await this.db.table(collection).update(id, {
        _sync: 0,
      });

      // post error to the client
      self.postMessage({
        validation: err,
      });

      // in case of not_found we need to remove the local record
      if (err.type === 'not_found') {
        await this.db.table(collection).delete(id as string);
      }
    }
  }

  protected async syncLive() {
    this.#worker.postMessage(
      JSON.stringify({
        sync: 'live',
        token: this.token,
        headers: this.#headers,
        params: this.#params,
        serverURL: this.#serverURL,
      })
    );
  }

  protected async syncBatch(activity: SyncActivity) {
    this.#worker.postMessage(
      JSON.stringify({
        sync: 'batch',
        activity,
        token: this.token,
        headers: this.#headers,
        params: this.#params,
        serverURL: this.#serverURL,
      })
    );
  }

  protected async syncScheduler() {
    this.#worker.postMessage(
      JSON.stringify({
        sync: 'scheduler',
        serverURL: this.#serverURL,
      })
    );
  }

  public setWorker({ worker }: { worker: Worker }) {
    this.#worker = worker;
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

      // add internal schemas
      dexieSchema['_sync'] = `[collection+activity], ${Object.keys(
        InstaSyncSchema.shape
      ).join(', ')}`;

      dexieSchema['_cache'] = `[key], ${Object.keys(
        InstaCacheSchema.shape
      ).join(', ')}`;

      const db = new Dexie(this.#name);

      db.version(this.#version).stores(dexieSchema);

      this.#db = db;
      this.#db.on('ready', async () => {
        /* istanbul ignore next */
        if (this.#inspect && !isServer()) {
          // @ts-ignore
          window['insta'] = this;
        }

        if (isServer()) {
          // pre populate cache with default values
          await this.cache.populate();

          // ensure the sync table and all collections are empty in case there's no session
          try {
            const { token } = await this.cache.get('session');
            if (!token) {
              await this.db.table('_sync').clear();
              for (const collection of this.collections) {
                await this.db.table(collection).clear();
              }
            }
          } catch (error) {
            // fine for now. it's breaking tests without this
          }
        }

        Promise.resolve();
      });
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

      return `${(estimatedTotalMB || 0).toFixed(2)} MB`;
    }

    //  calculate overall for all collections
    const collections = Object.keys(this.#schema);
    let totalSize = 0;

    for (const collection of collections) {
      const count = await this.db.table(collection).count();
      const sampleSize = Math.min(100, count);
      let totalSampleSize = 0;
      const samples = await this.db
        .table(collection)
        .limit(sampleSize)
        .toArray();

      for (const sample of samples) {
        totalSampleSize += new Blob([JSON.stringify(sample)])?.size;
      }

      const averageSize = totalSampleSize / sampleSize;
      const estimatedTotalSize = averageSize * count;
      const estimatedTotalMB = estimatedTotalSize / (1024 * 1024);

      totalSize += estimatedTotalMB;
    }

    return `${(totalSize || 0).toFixed(2)} MB`;
  }

  /* istanbul ignore next */
  public async destroy({ db = true }: { db?: boolean } = {}) {
    this.#batch?.complete();
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

    if (this.wss && this.wss.readyState === WebSocket.OPEN) {
      this.wss.close();
    }

    this.#pendingMutationsBusy = false;
    this.#pendingPointersBusy = false;

    /* istanbul ignore next */
    if (this.#inspect) {
      console.log('🧹 Instant instance destroyed');
    }

    return Promise.resolve();
  }

  /**
   * worker entry point
   * should be called only once within your worker setup
   * anything executed here is ran in the background thread
   *
   * @example
   * import { insta } from './your-shared-instance';
   *
   * addEventListener('message', insta.worker()); // <- this is it
   *
   * @returns void
   */
  public worker() {
    return async ({ data }: { data: string }) => {
      const {
        sync = 'batch', // batch|live|unsync|scheduler|recordActivity
        synced_at,
        token = '',
        headers = {},
        params = {},
        activity = 'recent', // recent|oldest
        serverURL = '',
      } = JSON.parse(data);

      try {
        if (!this.#db) {
          await this.ready();
        }

        if (serverURL && !this.#serverURL) {
          this.#serverURL = serverURL;
        }

        if (sync === 'unsync') {
          await this.cloud.unsync();
          return;
        }

        if (sync === 'scheduler') {
          /**
           * task scheduler for
           * - pending mutations
           * - pending pointers
           */
          this.startTaskScheduler();

          /**
           * batch scheduler for
           * - fetching paginated data from the server
           * - updating the local indexedDB
           * - keeping syncing older and new data in background
           */
          this.#createSyncBatch();
          return;
        }

        if (sync === 'recordActivity') {
          this.lastActivityTimestamp = Date.now();
          if (!this.schedulerSubscription) {
            this.startTaskScheduler();
          }
          return;
        }

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
          if (!token) {
            if (this.#inspect) {
              console.warn('No token provided for batch sync');
            }
            return Promise.resolve();
          }

          if (token && !this.#session?.token) {
            this.#session = {
              ...this.#session,
              token,
            } as InstaSession;
          }

          this.#headers = headers;
          this.#params = params;

          const perf = performance.now();

          const collections = this.collections;
          const limit = isMobile ? 100 : 1000;

          for (const collection of collections) {
            try {
              /* istanbul ignore next */
              if (this.inspect) {
                const syncDuration = performance.now() - perf;
                const usage = await this.usage(collection);
                console.log(
                  `💨 sync ${syncDuration.toFixed(2)}ms`,
                  collection,
                  activity,
                  synced_at
                );
                console.log('💾 estimated usage for', collection, usage);
              }

              const sync = await this.#useSync({
                collection,
                activity,
              });

              if (activity === 'recent' && !sync.synced_at) {
                // try to get the most recent _updated_at from the local db
                const mostRecentUpdatedAt = await this.db
                  .table(collection)
                  .orderBy('_updated_at')
                  .reverse()
                  .first()
                  .then((doc) => doc?._updated_at);

                if (mostRecentUpdatedAt) {
                  sync.synced_at = mostRecentUpdatedAt;
                } else {
                  // otherwise we default to current date
                  sync.synced_at = new Date().toISOString();
                }
              }

              let url = `${
                this.#serverURL
              }/sync/${collection}?activity=${activity}`;

              if (synced_at || sync.synced_at) {
                url += `&synced_at=${synced_at || sync.synced_at}`;
              }

              await this.runBatchWorker({
                url: url + `&limit=${limit}`,
                token,
                headers,
                params,
              });
            } catch (err) {
              this.errors.next(err as InstaError<CloudSchema>);
              /* istanbul ignore next */
              if (this.#inspect) {
                console.error('Error syncing', err);
              }
            }
          }
        }

        if (sync === 'live') {
          const url = `${this.#serverURL.replace(
            'http',
            'ws'
          )}/sync/live?session=${this.token}`;
          this.runLiveWorker({ url, token, headers, params });
        }
      } catch (err) {
        /* istanbul ignore next */
        if (this.inspect) {
          console.error('Error running worker', err, data);
        }
      }
    };
  }

  public cloud = {
    /**
     * Run custom cloud code
     */
    run: async <K extends keyof CloudSchema['body']>(
      name: K,
      body?: z.infer<CloudSchema['body'][K]>,
      options?: {
        headers?: z.infer<CloudSchema['headers'][K]>;
      }
    ): Promise<z.infer<CloudSchema['response'][K]>> => {
      try {
        const res = await fetcher(
          `${this.#serverURL}/cloud/${name as string}`,
          {
            direct: true,
            method: 'POST',
            body,
            headers: {
              authorization: `Bearer ${this.token}`,
              ...this.#headers,
              ...(options?.headers || {}),
            },
          }
        );
        return res;
      } catch (error) {
        this.errors.next(error as InstaError<CloudSchema>);
        return Promise.reject(error);
      }
    },

    /**
     * Starts the sync process for known collections
     */
    sync: async ({
      /**
       * session containing token and user info
       */
      session,
      /**
       * custom headers to send to the server
       */
      headers,
      /**
       * custom query params to send to the server
       */
      params,
    }: {
      session?: Partial<InstaSession>;
      headers?: Record<string, string>;
      params?: Record<string, string>;
    } = {}) => {
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

      this.#session = (session as InstaSession) || this.#session;
      this.#headers = headers || {};
      this.#params = params || {};

      this.#worker.onmessage = (ev: MessageEvent) => {
        const {
          data: { validation },
        } = ev;
        if (validation) {
          this.errors.next(validation);
        }
      };

      await Promise.allSettled([
        this.syncLive(),
        this.syncScheduler(),
        this.syncBatch('oldest'),
        this.syncBatch('recent'),
      ]);
    },

    /**
     * clear the sync state and all collections
     */
    unsync: async () => {
      try {
        this.#session = undefined;
        this.#destroyed.next();
        this.wss?.close(1000, 'Unsynced');
        if (this.#batch.observed) {
          this.#batch.complete();
        }
        this.stopTaskScheduler();
      } catch (err) {
        // console.error('Error unsyncing', err);
      }

      if (!isServer()) {
        this.#worker.postMessage(
          JSON.stringify({
            sync: 'unsync',
            serverURL: this.#serverURL,
          })
        );
      } else {
        await this.#db.table('_sync').clear();

        for (const collection of Object.keys(this.#schema)) {
          await this.#db.transaction(
            'rw?',
            this.#db.table(collection),
            async () => {
              await this.#db.table(collection).clear();
            }
          );
        }
      }
    },

    /**
     * Become a specific user by setting the session
     */
    become: async (session: Partial<InstaSession>) => {
      this.#session = session as InstaSession;
      await this.cache.set('session', session);
    },
  };

  public cache = {
    get: async <CacheKey extends keyof CacheSchema>(
      key: CacheKey
    ): Promise<NonNullable<z.infer<CacheSchema[CacheKey]>>> => {
      const { value } = (await this.db
        .table('_cache')
        .where('key')
        .equals(key as string)
        .first()) || { value: {} };

      return value as NonNullable<z.infer<CacheSchema[CacheKey]>>;
    },
    set: async <CacheKey extends keyof CacheSchema>(
      key: CacheKey,
      value: NonNullable<z.infer<CacheSchema[CacheKey]>>
    ) => {
      await this.db.transaction('rw', this.db.table('_cache'), async () => {
        await this.db.table('_cache').put({ key, value });
      });
    },
    del: async <CacheKey extends keyof CacheSchema>(key: CacheKey) => {
      await this.db.transaction('rw', this.db.table('_cache'), async () => {
        await this.db
          .table('_cache')
          .where('key')
          .equals(key as string)
          .delete();
      });
    },
    default: <CacheKey extends keyof CacheSchema>(key: CacheKey) => {
      // Pre-populate with default values based on the zod schema
      const schema = this.#cache[key as keyof CacheSchema];
      const defaultValues = {} as NonNullable<z.infer<CacheSchema[CacheKey]>>;
      for (const [k, v] of Object.entries(
        (schema as unknown as z.ZodObject<any, any, any>).shape
      )) {
        defaultValues[k as keyof z.infer<CacheSchema[CacheKey]>] =
          v instanceof z.ZodDefault
            ? v._def.defaultValue()
            : (undefined as never); // Ensure this is never assigned
      }
      return defaultValues;
    },
    populate: async () => {
      const cache = await this.db.table('_cache').toArray();
      for (const key in this.#cache) {
        const c = cache.find((c) => c.key === key);
        if (!c?.value) {
          const value = this.cache.default(key);
          await this.db.table('_cache').add({
            key,
            value,
          });
        }
      }
    },
    clear: async () => {
      await this.db.transaction('rw', this.db.table('_cache'), async () => {
        await this.db.table('_cache').clear();
        await this.cache.populate();
      });
    },
  };

  /**
   * Mutate data locally and synchronize with the server
   *
   * 1. Mutate data locally
   * 2. If online, send changes to the server
   * 3. Server propagates changes to other connected clients
   * 4. Local database stays in sync via websocket
   *
   * @example
   * const user = await insta.mutate('users').add({ name: 'John' });
   * console.log(user);
   * // { _id: 'a1b2-c3d4-e5f6', _uuid: 'a1b2-c3d4-e5f6', _sync: 1, _updated_at: '2024-09-15T12:00:00Z', name: 'John' }
   *
   * // ... a couple of milliseconds later
   * const user = await insta.db.table('users').where('_uuid').equals(user._uuid).first();
   *
   * console.log(user);
   * // { _id: 'zxAvYaLcR', _uuid: 'a1b2-c3d4-e5f6', _sync: 0, _updated_at: '2024-09-15T12:00:10Z', name: 'John' }
   * // _id is different here because it means this object was synced and given a new identifier from the server to be used as source of truth
   * // while _uuid is the local generated id used to reference the object before syncing
   * @returns void
   */
  public mutate<C extends keyof CollectionSchema>(collection: C) {
    if (!this.user) {
      throw new Error(
        'User not set. Try to pass a session to the `sync` method before using mutate.'
      );
    }
    if (!this.token) {
      throw new Error(
        'Token not set. Try to pass the session token as `session` to the Instant constructor or `sync` method.'
      );
    }
    return {
      add: async (
        value: Partial<z.infer<CollectionSchema[keyof CollectionSchema]>>
      ) => {
        const now = new Date().toISOString();
        const valueWithMetadata = { ...value } as Partial<
          z.infer<CollectionSchema[keyof CollectionSchema]>
        > & {
          _id: string;
          _uuid: string;
          _sync: number;
          _created_at: string;
          _updated_at: string;
          _created_by: string;
          _updated_by: string;
          _expires_at?: string;
          _deleted_by?: string;
        };

        valueWithMetadata._sync = 1;
        valueWithMetadata._created_at = now;
        valueWithMetadata._updated_at = now;
        valueWithMetadata._id = guid();
        valueWithMetadata._uuid = valueWithMetadata._id;
        valueWithMetadata._created_by = createPointer('users', this.user);
        valueWithMetadata._updated_by = createPointer('users', this.user);

        await this.db.transaction(
          'rw!',
          this.db.table(collection as string),
          async () => {
            await this.db.table(collection as string).add(valueWithMetadata);
            this.recordActivity();
          }
        );

        return valueWithMetadata;
      },
      update: async (
        id: string,
        value: Partial<z.infer<CollectionSchema[keyof CollectionSchema]>>
      ) => {
        const currentDoc = await this.db.table(collection as string).get(id);
        if (!currentDoc) {
          throw new Error('Document not found');
        }

        // calc what changed excluding _updated_at, _created_at, _sync
        const updatedFields = this.#updatedFields(currentDoc, value);

        // skip if nothing changed
        if (Object.keys(updatedFields).length === 0) {
          const err = createError(
            400,
            'validation_error',
            'No changes provided',
            'The data provided for this document is not valid. Please provide at least one field to update.'
          );

          this.errors.next(err as unknown as InstaError<CloudSchema>);
          return Promise.reject(err);
        }

        // append required fields to updatedFields
        // const schemaFields = this.#schema[collection as keyof CollectionSchema];
        // const schema = schemaFields as unknown as z.ZodObject<any>;
        // const requiredFields = Object.keys(schema.shape).filter(
        //   (key) => !schema.shape[key].isOptional()
        // );

        // requiredFields.forEach((field) => {
        //   updatedFields[field] = value[field];
        // });

        await this.db.transaction(
          'rw!',
          this.db.table(collection as string),
          async () => {
            await this.db.table(collection as string).update(id, {
              ...currentDoc,
              ...value,
              _sync: 1,
              _updated_at: new Date().toISOString(),
              _updated_by: createPointer('users', this.user),
              _updated_fields: updatedFields,
            });
            this.recordActivity();
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
              _deleted_by: createPointer('users', this.user),
            });
            this.recordActivity();
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
        return createError(
          400,
          'validation_error',
          'Invalid data provided',
          `The data provided for ${singular(collection)} is not valid.`,
          zodError.errors.map((err) => ({
            path: err.path.join('.'),
            message: err.message,
          }))
        );
      }
    }

    return {} as InstaError;
  }

  /**
   * Checks if a document is expired, newly created or needs to be synced
   */
  public modified(row: Document) {
    return row['_expires_at'] || row['_id'].includes('-') || row['_sync'] === 1;
  }

  /**
   * Count local data based on query criteria
   *
   * @example
   * const count = await insta.count('users', {
   *     $filter: {
   *       name: { $regex: 'John', $options: 'i' },
   *       age: { $gt: 18 }
   *     },
   *     $or: [
   *       { status: 'active' },
   *       { lastLogin: { $exists: true } }
   *     ]
   * });
   *
   * // console.log(count)
   * // 5
   */
  public async count<C extends keyof CollectionSchema>(
    collectionName: C,
    query: Exclude<iQLDirectives<z.infer<CollectionSchema[C]>>, '$by'> &
      iQL<CollectionSchema>
  ): Promise<number> {
    let table = this.db.table(collectionName as string);
    const tableQuery = query as iQLDirectives<z.infer<CollectionSchema[C]>> &
      iQL<CollectionSchema>;

    let queryCollection: Collection<
      z.infer<CollectionSchema[C]>,
      IndexableType
    > = table as unknown as Collection<
      z.infer<CollectionSchema[C]>,
      IndexableType
    >;

    // Apply $filter
    if (tableQuery.$filter) {
      if (typeof tableQuery.$filter === 'function') {
        queryCollection = queryCollection.filter(tableQuery.$filter);
      } else {
        for (const [field, condition] of Object.entries(tableQuery.$filter)) {
          // @todo implement $exists and $nin
          // if (condition && '$exists' in condition) {
          //   queryCollection = queryCollection.filter(
          //     (item) => item[field] != null
          //   );
          // }
          // if (condition && '$nin' in condition && condition.$nin) {
          //   queryCollection = queryCollection.filter(
          //     (item) => !(condition.$nin ?? []).includes(item[field])
          //   );
          // }
          if (condition && '$regex' in condition && condition.$regex) {
            const regex = new RegExp(
              condition.$regex,
              condition.$options ?? ''
            );
            queryCollection = queryCollection.filter((item) =>
              regex.test(item[field])
            );
          }
          if (condition && '$eq' in condition) {
            queryCollection = queryCollection.filter(
              (item) => item[field] === condition.$eq
            );
          }
          // @todo implement $gt, $lt, $gte, $lte
          // if (condition && '$gt' in condition) {
          //   queryCollection = queryCollection.filter(
          //     (item) => item[field] > condition.$gt
          //   );
          // }
          // if (condition && '$lt' in condition) {
          //   queryCollection = queryCollection.filter(
          //     (item) => item[field] < condition.$lt
          //   );
          // }
          // if (condition && '$gte' in condition) {
          //   queryCollection = queryCollection.filter(
          //     (item) => item[field] >= condition.$gte
          //   );
          // }
          // if (condition && '$lte' in condition) {
          //   queryCollection = queryCollection.filter(
          //     (item) => item[field] <= condition.$lte
          //   );
          // }
        }
      }
    }

    // Apply $or
    if (tableQuery.$or) {
      queryCollection = queryCollection.filter((item) => {
        return tableQuery.$or!.some((condition) => {
          return Object.entries(condition).every(([field, fieldCondition]) => {
            // @todo implement exact match for all types
            // if (typeof fieldCondition === 'object') {
            // @todo implement $exists and $nin
            // if ('$exists' in fieldCondition) {
            //   return fieldCondition.$exists
            //     ? item[field] != null
            //     : item[field] == null;
            // }
            // if ('$nin' in fieldCondition) {
            //   return !(fieldCondition.$nin ?? []).includes(item[field]);
            // }

            if (fieldCondition && '$regex' in fieldCondition) {
              const regex = new RegExp(
                fieldCondition.$regex as string,
                fieldCondition.$options ?? ''
              );
              return regex.test(item[field]);
            }

            if (fieldCondition && '$eq' in fieldCondition) {
              return item[field] === fieldCondition.$eq;
            }

            // @todo implement $gt, $lt, $gte, $lte
            // if ('$gt' in fieldCondition) {
            //   return item[field] > fieldCondition.$gt;
            // }
            // if ('$lt' in fieldCondition) {
            //   return item[field] < fieldCondition.$lt;
            // }
            // if ('$gte' in fieldCondition) {
            //   return item[field] >= fieldCondition.$gte;
            // }
            // if ('$lte' in fieldCondition) {
            //   return item[field] <= fieldCondition.$lte;
            // }
            // } else {
            //   return item[field] === fieldCondition;
            // }

            return false;
          });
        });
      });
    }

    return queryCollection.count();
  }

  /**
   * Provides easy access to nested data while utilizing a MongoDB-like query style.
   * This syntax is then translated to Dexie operations for local data retrieval.
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
  public async query<Q extends iQL<CollectionSchema>>(
    iql: Q
  ): Promise<{
    [K in keyof Q]: z.infer<CollectionSchema[K & keyof CollectionSchema]>[];
  }> {
    return this.#executeQuery(iql);
  }

  async #executeQuery<Q extends iQL<CollectionSchema>>(
    queryObject: Q,
    parentTable?: keyof CollectionSchema,
    parentId?: string
  ): Promise<{
    [K in keyof Q]: z.infer<CollectionSchema[K & keyof CollectionSchema]>[];
  }> {
    const result = {} as {
      [K in keyof Q]: z.infer<CollectionSchema[K & keyof CollectionSchema]>[];
    };

    for (const tableName in queryObject) {
      if (
        Object.prototype.hasOwnProperty.call(queryObject, tableName) &&
        !tableName.startsWith('$')
      ) {
        const table = this.db.table(tableName);
        const tableQuery = queryObject[tableName] as iQLDirectives<
          z.infer<CollectionSchema[keyof CollectionSchema]>
        > &
          iQL<CollectionSchema>;

        let collection: Collection<
          z.infer<CollectionSchema[keyof CollectionSchema]>,
          IndexableType
        > = table as unknown as Collection<
          z.infer<CollectionSchema[keyof CollectionSchema]>,
          IndexableType
        >;

        // Handle parent relationship
        if (parentTable && parentId) {
          const by = queryObject[tableName]!['$by'];
          const pointerField =
            by ||
            this.#getPointerField(
              tableName as keyof CollectionSchema,
              parentTable
            );

          if (pointerField) {
            collection = collection.filter(
              (item) =>
                item[
                  pointerField as keyof z.infer<
                    CollectionSchema[keyof CollectionSchema]
                  >
                ] === `${parentTable as string}$${parentId}`
            );
          }
        }

        // Apply $sort
        let sortFields: [string, number | undefined][] = [];
        if (tableQuery.$sort && Object.keys(tableQuery.$sort).length > 0) {
          sortFields = Object.entries(tableQuery.$sort);

          // const primarySortField = sortFields[0][0];
          const primarySortOrder = sortFields[0][1];

          // Construct the compound index string with brackets
          const indexString = `[${sortFields
            .map(([field, _]) => field)
            .join('+')}]`;

          // Apply the sort
          collection = (
            collection as unknown as Table<
              z.infer<CollectionSchema[keyof CollectionSchema]>,
              IndexableType
            >
          ).orderBy(indexString);

          // Apply reverse for descending order if needed
          if (primarySortOrder === -1) {
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
              // @todo implement $exists and $nin
              // if (condition && '$exists' in condition) {
              //   collection = collection.filter((item) => item[field] != null);
              // }
              // if (condition && '$nin' in condition && condition.$nin) {
              //   collection = collection.filter(
              //     (item) => !(condition.$nin ?? []).includes(item[field])
              //   );
              // }
              if (condition && '$regex' in condition && condition.$regex) {
                const regex = new RegExp(
                  condition.$regex,
                  condition.$options ?? ''
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
                    // @todo implement $exists and $nin
                    // if ('$exists' in fieldCondition) {
                    //   return fieldCondition.$exists
                    //     ? item[field] != null
                    //     : item[field] == null;
                    // }
                    // if ('$nin' in fieldCondition) {
                    //   return !(fieldCondition.$nin ?? []).includes(item[field]);
                    // }
                    if ('$regex' in fieldCondition) {
                      const regex = new RegExp(
                        fieldCondition.$regex as string,
                        fieldCondition.$options ?? ''
                      );
                      return regex.test(item[field]);
                    }
                    if ('$eq' in fieldCondition) {
                      return item[field] === fieldCondition.$eq;
                    }
                  }
                  // } else {
                  //   return item[field] === fieldCondition;
                  // }
                  return false;
                }
              );
            });
          });
        }

        // Execute the query
        let tableData = cloneDeep(await collection.toArray());

        // Sort by secondary sort fields if more than one sort field
        if (sortFields.length > 1) {
          tableData.sort((a: any, b: any) => {
            for (let i = 0; i < sortFields.length; i++) {
              const [field, order] = sortFields[i] as [string, number];
              if (a[field] < b[field]) return -1 * order;
              if (a[field] > b[field]) return 1 * order;
            }
            return 0;
          });
        }

        // Process nested queries in parallel @todo
        // const processNestedQueries = async (item: any) => {
        //   const nestedQueries = Object.entries(tableQuery)
        //     .filter(
        //       ([key, value]) =>
        //         !key.startsWith('$') && typeof value === 'object'
        //     )
        //     .map(async ([nestedTableName, nestedQuery]) => {
        //       const result = await this.#executeQuery(
        //         { [nestedTableName]: nestedQuery } as Q,
        //         tableName as keyof CollectionSchema,
        //         item._id
        //       );
        //       return [nestedTableName, result[nestedTableName]];
        //     });

        //   const results = await Promise.all(nestedQueries);
        //   results.forEach(([nestedTableName, result]) => {
        //     item[nestedTableName as keyof typeof item] = result;
        //   });
        // };

        // await Promise.all(tableData.map(processNestedQueries));

        for (const item of tableData) {
          for (const nestedTableName in tableQuery) {
            if (
              Object.prototype.hasOwnProperty.call(
                tableQuery,
                nestedTableName
              ) &&
              !nestedTableName.startsWith('$')
            ) {
              const nestedQuery = tableQuery[nestedTableName] as iQLDirectives<
                z.infer<CollectionSchema[keyof CollectionSchema]>
              > &
                iQL<CollectionSchema>;

              const nestedResult = await this.#executeQuery(
                { [nestedTableName]: nestedQuery } as Q,
                tableName as keyof CollectionSchema,
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

  #getPointerField(
    childTable: keyof CollectionSchema,
    parentTable: keyof CollectionSchema
  ): string | undefined {
    const childSchema = this.#schema[childTable];

    // First check for custom named pointer fields (not needed anymore, keeping for future reference)
    // eg: { users: { posts: { $by: 'author' } } }
    // for (const [fieldName, fieldSchema] of Object.entries(
    //   (childSchema as unknown as z.ZodObject<any, any, any>).shape
    // )) {
    //   if (fieldSchema instanceof z.ZodBranded) {
    //     if (fieldSchema.description === 'pointer') {
    //       return fieldName;
    //     }
    //   }
    // }

    // Lastly, check for fields starting with _p_
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

    // getting here is unlikely to happen because Dexie would fail before
    /* istanbul ignore next */
    return undefined;
  }

  #updatedFields(
    currentDoc: Document,
    newDoc: Partial<z.infer<CollectionSchema[keyof CollectionSchema]>>
  ) {
    return Object.keys(newDoc).reduce((acc, key) => {
      if (
        !['_updated_at', '_created_at', '_sync'].includes(key) &&
        newDoc[key] !== currentDoc[key]
      ) {
        acc[key] = newDoc[key];
      }
      return acc;
    }, {} as Record<string, any>);
  }

  #createSyncBatch() {
    this.#batch = new Subject<{
      collection: string;
      synced_at: string;
      activity: SyncActivity;
      token: string;
      headers: Record<string, string>;
      params: Record<string, string>;
    }>();
    this.#batch
      .pipe(
        takeUntil(this.#destroyed),
        bufferTime(this.#buffer),
        filter((collections) => collections.length > 0),
        tap(async (collections) => {
          for (const {
            collection,
            activity,
            synced_at,
            token,
            headers,
            params,
          } of collections) {
            try {
              /* istanbul ignore next */
              const perf = performance.now();
              const limit = isMobile ? 100 : 1000;
              const url = `${
                this.#serverURL
              }/sync/${collection}?activity=${activity}&synced_at=${synced_at}&limit=${limit}`;

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
                  synced_at
                );
                console.log('💾 estimated usage for', collection, usage);
              }

              // maybe they logged out
              if (!this.token) {
                await this.cloud.unsync();
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

  private startTaskScheduler() {
    if (this.schedulerSubscription) {
      this.schedulerSubscription.unsubscribe();
    }

    this.schedulerSubscription = interval(1000)
      .pipe(
        tap(async () => {
          const currentTime = Date.now();
          if (
            currentTime - this.lastActivityTimestamp >
            this.inactivityThreshold
          ) {
            this.stopTaskScheduler();
            return;
          }

          await Promise.allSettled([
            this.runPendingMutations(),
            this.runPendingPointers(),
          ]);
        })
      )
      .subscribe();
  }

  private stopTaskScheduler() {
    if (this.schedulerSubscription) {
      this.schedulerSubscription.unsubscribe();
      this.schedulerSubscription = null;
    }
  }

  // Call this method whenever there's user activity
  public recordActivity() {
    this.#worker.postMessage(
      JSON.stringify({ sync: 'recordActivity', serverURL: this.#serverURL })
    );
  }
}
