/* eslint-disable @typescript-eslint/no-unused-vars */
import Elysia, { StatusMap } from 'elysia';
import type { HTTPHeaders } from 'elysia/dist/types';
import { ElysiaWS } from 'elysia/dist/ws';
import { SignJWT } from 'jose';
import type {
  AggregateOptions,
  CreateIndexesOptions,
  Db,
  Document,
  Filter,
  IndexSpecification,
  ObjectId,
  Sort,
} from 'mongodb';
import {
  ChangeStreamDeleteDocument,
  ChangeStreamInsertDocument,
  ChangeStreamUpdateDocument,
  MongoClient,
} from 'mongodb';
import { singular } from 'pluralize';
import {
  interval,
  Subscription,
  tap,
} from 'rxjs';
import { z } from 'zod';

import {
  createPointer,
  ejectPointerCollection,
  ejectPointerId,
  InstaError,
  InstaErrorParams,
  InstaSession,
  InstaSessionSchema,
  InstaUser,
  InstaUserEmailSchema,
  InstaUserSchema,
  isArrayPointer,
  isEmpty,
  isPointer,
  omit,
  pointer,
  SyncResponse,
  SyncResponseData,
  SyncStatus,
} from '@borda/client';

import { JWTPayloadSpec } from '@elysiajs/jwt';

import {
  compare,
  hash,
  newObjectId,
} from '../utils';

type SchemaType = Record<string, z.ZodType<any, any, any>>;

type JWT = {
  readonly sign: (
    morePayload: Record<string, string | number> & JWTPayloadSpec
  ) => Promise<string>;
  readonly verify: (jwt?: string | undefined) => Promise<any>;
};

/**
 * A custom query language inspired by MongoDB query style.
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
 *       name: { $regex: 'John', $options: 'i' },
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

export type iQLDirectives<CollectionSchema> = {
  $limit?: number;
  $skip?: number;
  $sort?: Sort;
  $or?: Array<{
    [K in keyof CollectionSchema]?: Filter<CollectionSchema> | CollectionSchema;
  }>;
  $by?: string;
  $include?: string[];
  $options?: AggregateOptions;
} & (
  | {
      $filter?: { [K in keyof CollectionSchema]?: Filter<CollectionSchema> };
      $aggregate?: never;
    }
  | {
      $aggregate?: Document[];
      $filter?: never;
      $limit?: never;
      $skip?: never;
      $sort?: never;
      $or?: never;
    }
);

export type CloudHookAction =
  | 'beforeSave'
  | 'afterSave'
  | 'beforeDelete'
  | 'afterDelete';

export type DBHookAction = 'afterUpdate' | 'afterInsert' | 'afterDelete';

export interface SetOptions {
  headers: HTTPHeaders;
  status?: number | keyof StatusMap;
}

export interface SyncConstraint {
  key: string;
  collection: string;
}

export type IndexDictionary<CollectionSchema> = Partial<
  Record<
    keyof CollectionSchema,
    Record<
      string,
      {
        definition: IndexSpecification;
        options?: CreateIndexesOptions;
      }
    >
  >
>;

export const InstaSyncHeadersSchema = z.object({
  authorization: z.string().regex(/^Bearer /),
  synced_at: z.optional(z.union([z.null(), z.date()])),
  activity: z.union([z.literal('recent'), z.literal('oldest')]).optional(),
  limit: z.number().optional(),
});

export type InstaSyncHeaders = z.infer<typeof InstaSyncHeadersSchema>;

interface DerivedSession {
  _id?: string | undefined;
  _expires_at?: number | undefined;
  token?: string | undefined;
  user?: InstaUser | undefined;
}

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
  #maxBatchSize = 10_000;
  #inspect = false;
  #connection = new Map<string, { clients: ElysiaWS<object, object>[] }>();
  #index!: IndexDictionary<CollectionSchema>;
  #constraints: SyncConstraint[] = [];
  #schema!: CollectionSchema;
  #cache!: CacheSchema;
  #cacheTTL!: number;
  #secret!: string;
  #cacheStorage = new Map<
    keyof CacheSchema,
    {
      expiresAt: number;
      value: NonNullable<z.infer<CacheSchema[keyof CacheSchema]>>;
    }
  >();
  #pendingTasks: Subscription | undefined;
  #pendingPointersBusy = false;
  #mongoURI: string;
  #db!: Db;
  #dbHooks?: Record<
    keyof CollectionSchema,
    Record<
      DBHookAction,
      (data: { doc: CollectionSchema[keyof CollectionSchema] }) => Promise<void>
    >
  >;
  #collections: string[] = [];
  #cloud: Record<string, (args: any) => Promise<any>> = {};
  #cloudSchema!: CloudSchema['body'];
  #cloudHeaders!: CloudSchema['headers'];
  #cloudResponse!: CloudSchema['response'];
  #cloudHooks?: Record<
    keyof CollectionSchema,
    Record<
      CloudHookAction,
      (data: {
        session: DerivedSession;
        before?: CollectionSchema[keyof CollectionSchema] | undefined;
        doc: CollectionSchema[keyof CollectionSchema];
      }) => Promise<CollectionSchema[keyof CollectionSchema]>
    >
  >;

  get db() {
    if (!this.#db) {
      throw new Error('MongoDB is not initialized');
    }
    return this.#db as Db & {
      addHook: <C extends keyof CollectionSchema>(
        action: DBHookAction,
        collection: C,
        fn: (data: { doc: z.infer<CollectionSchema[C]> }) => Promise<void>
      ) => void;
      removeHook: <C extends keyof CollectionSchema>(
        action: DBHookAction,
        collection: C
      ) => void;
    };
  }

  get collections() {
    return this.#collections;
  }

  get functions() {
    return Object.keys(this.#cloudSchema);
  }

  constructor({
    inspect,
    constraints,
    schema,
    cache,
    cloud,
    db,
    mongoURI,
    index,
    secret,
    cacheTTL,
  }: {
    inspect?: boolean | undefined;
    constraints?: SyncConstraint[];
    schema: CollectionSchema;
    cache?: CacheSchema;
    cloud?: CloudSchema;
    db?: Db;
    mongoURI?: string;
    index?: IndexDictionary<CollectionSchema>;
    secret?: string;
    cacheTTL?: number;
  }) {
    if (!schema) {
      throw new Error('a data schema is required');
    }

    if (cloud) {
      this.#cloudSchema = cloud.body;
      this.#cloudHeaders = cloud.headers;
      this.#cloudResponse = cloud.response;
    }

    if (db) {
      this.#db = db;
    }

    this.#schema = {
      users: InstaUserSchema,
      sessions: InstaSessionSchema,
      ...schema,
    };
    this.#cache = cache || ({} as CacheSchema);
    this.#cacheTTL =
      cacheTTL || parseInt(process.env['INSTA_CACHE_TTL'] || '3600');
    this.#inspect = inspect || this.#inspect;
    this.#constraints = constraints || [];
    this.#mongoURI = mongoURI || process.env['INSTA_MONGO_URI'] || '';
    this.#index = index || {};
    this.#secret = secret || process.env['INSTA_SECRET'] || '1nSt@nT3';
    this.#collections = Object.keys(schema).filter((key) => {
      try {
        const { sync } = JSON.parse(
          schema[key as keyof CollectionSchema]?.description || '{}'
        );
        return schema[key as keyof CollectionSchema] && sync;
      } catch (err) {
        return false;
      }
    });

    this.#dbAttachHandlers();
  }

  #dbAttachHandlers() {
    if (!this.#db) {
      return;
    }
    // @ts-ignore
    this.#db.addHook = (
      action: DBHookAction,
      collection: string,
      fn: (data: any) => Promise<void>
    ) => {
      if (!this.#dbHooks) {
        this.#dbHooks = {} as any;
      }
      if (!this.#dbHooks?.[collection]) {
        // @ts-ignore
        this.#dbHooks![collection] = {} as any;
      }
      if (!this.#dbHooks?.[collection]?.[action]) {
        this.#dbHooks![collection][action] = fn as any;
      }
    };
    // @ts-ignore
    this.#db.removeHook = (action: DBHookAction, collection: string) => {
      if (this.#dbHooks?.[collection]?.[action]) {
        delete this.#dbHooks![collection][action];
      }
    };
  }

  #buildIdentifiers({
    query,
    constraints,
  }: {
    query: Record<string, string>;
    constraints: SyncConstraint[];
  }): string[] {
    const identifiers = [];

    // console.log('query', query);
    // console.log('constraints', constraints);

    for (const c of constraints) {
      if (query[c.key] && !query[c.key].includes(',')) {
        identifiers.push(`@${c.key}:${query[c.key]}`);
      } else {
        const ids = query[c.key]?.split(',') || [];
        for (const id of ids) {
          identifiers.push(`@${c.key}:${id}`);
        }
      }
    }

    if (!identifiers.length) {
      if (this.#inspect) {
        console.warn(
          '🚨 no constraints found. the sync will be broadcast to everyone.'
        );
      }
      identifiers.push('broadcast');
    }

    return identifiers;
  }

  #liveSync() {
    const excludedFields = ['_id', '_created_at', '_updated_at', '_expires_at'];

    const maybePointer = (key: string, value: unknown) => {
      if (
        key.startsWith('_p_') &&
        typeof value === 'string' &&
        value.includes('$')
      ) {
        return value.split('$')[1];
      }
      return value;
    };

    const docQueryParams = (doc: Document) => {
      return Object.entries(doc)
        .filter(
          ([key, value]) =>
            typeof value === 'string' && !excludedFields.includes(key)
        )
        .reduce(
          (acc, [key, value]) => ({
            ...acc,
            [key.replace('_p_', '') as string]: maybePointer(key, value),
          }),
          {}
        );
    };

    for (const collection of [...this.#collections, 'sessions']) {
      const task = this.db.collection(collection);
      const stream = task.watch(
        [
          {
            $match: {
              operationType: {
                $in: ['insert', 'update', 'delete'],
              },
            },
          },
        ],
        {
          fullDocument: 'updateLookup',
        }
      );

      stream.on('error', (err) => {
        console.error('Instant listener error', err);
      });

      stream.on('close', () => {
        console.log('Instant listener close');
      });

      stream.on('init', () => {
        console.log('Instant listener initialized');
      });

      stream.on(
        'change',
        async (
          change:
            | ChangeStreamUpdateDocument
            | ChangeStreamInsertDocument
            | ChangeStreamDeleteDocument
        ) => {
          const { operationType } = change;

          const broadcast: Record<'update' | 'insert' | 'delete', () => void> =
            {
              update: async () => {
                const { fullDocument, updateDescription } =
                  change as ChangeStreamUpdateDocument;

                if (!fullDocument) {
                  return;
                }

                if (fullDocument['_expires_at']) {
                  return broadcast.delete();
                }

                if (!['sessions'].includes(collection)) {
                  const { updatedFields, removedFields, truncatedArrays } =
                    updateDescription ?? {};

                  const fullDocumentAsQueryParams: Record<string, string> =
                    docQueryParams(fullDocument || {});

                  const constraintsKeys = this.#constraints.map(
                    (constraint) => constraint.key
                  );

                  if (constraintsKeys.includes(collection)) {
                    const theKey = constraintsKeys.find(
                      (key) => key === collection
                    );
                    if (theKey) {
                      fullDocumentAsQueryParams[theKey] = fullDocument['_id'];
                    }
                  }

                  const identifiers = this.#buildIdentifiers({
                    query: fullDocumentAsQueryParams,
                    constraints: this.#constraints,
                  });

                  // cleanup value props with sync: false according to the schema
                  const value = this.#cleanValue(collection, fullDocument);

                  const response: SyncResponseData = {
                    collection: collection,
                    status: 'updated',
                    value,
                    updatedFields,
                    removedFields,
                    truncatedArrays,
                  };

                  for (const identifier of identifiers) {
                    const { clients } = this.#connection.get(identifier) || {
                      clients: [],
                    };

                    for (const client of clients) {
                      client.send(JSON.stringify(response));
                    }
                  }
                }

                // run db hooks
                if (this.#dbHooks?.[collection]?.['afterUpdate']) {
                  await this.#dbHooks?.[collection]?.['afterUpdate']({
                    doc: fullDocument as CollectionSchema[keyof CollectionSchema],
                  });
                }
              },
              insert: async () => {
                const { fullDocument } = change as ChangeStreamInsertDocument;
                if (!fullDocument) {
                  return;
                }
                if (!['sessions'].includes(collection)) {
                  const fullDocumentAsQueryParams: Record<string, string> =
                    docQueryParams(fullDocument || {});

                  const constraintsKeys = this.#constraints.map(
                    (constraint) => constraint.key
                  );

                  if (constraintsKeys.includes(collection)) {
                    const theKey = constraintsKeys.find(
                      (key) => key === collection
                    );
                    if (theKey) {
                      fullDocumentAsQueryParams[theKey] = fullDocument['_id'];
                    }
                  }

                  const identifiers = this.#buildIdentifiers({
                    query: fullDocumentAsQueryParams,
                    constraints: this.#constraints,
                  });

                  // cleanup value props with sync: false according to the schema
                  const value = this.#cleanValue(collection, fullDocument);

                  const response: SyncResponseData = {
                    collection: collection,
                    status: 'created',
                    value,
                  };

                  for (const identifier of identifiers) {
                    const { clients } = this.#connection.get(identifier) || {
                      clients: [],
                    };

                    for (const client of clients) {
                      client.send(JSON.stringify(response));
                    }
                  }
                }

                // run db hooks
                if (this.#dbHooks?.[collection]?.['afterInsert']) {
                  await this.#dbHooks?.[collection]?.['afterInsert']({
                    doc: fullDocument as CollectionSchema[keyof CollectionSchema],
                  });
                }
              },
              delete: async () => {
                const { fullDocument, fullDocumentBeforeChange } =
                  change as ChangeStreamDeleteDocument & {
                    fullDocument: Document;
                  };

                const doc = fullDocument || fullDocumentBeforeChange;
                if (!doc) {
                  return;
                }

                if (!['sessions'].includes(collection)) {
                  const fullDocumentAsQueryParams: Record<string, string> =
                    docQueryParams(doc || {});

                  const constraintsKeys = this.#constraints.map(
                    (constraint) => constraint.key
                  );

                  if (constraintsKeys.includes(collection)) {
                    const theKey = constraintsKeys.find(
                      (key) => key === collection
                    );
                    if (theKey) {
                      fullDocumentAsQueryParams[theKey] = doc['_id'];
                    }
                  }

                  const identifiers = this.#buildIdentifiers({
                    query: fullDocumentAsQueryParams,
                    constraints: this.#constraints,
                  });

                  const response: SyncResponseData = {
                    collection: collection,
                    status: 'deleted',
                    value: {
                      _id: doc['_id'],
                      _uuid: doc['_uuid'],
                    },
                  };

                  for (const identifier of identifiers) {
                    const { clients } = this.#connection.get(identifier) || {
                      clients: [],
                    };

                    for (const client of clients) {
                      client.send(JSON.stringify(response));
                    }
                  }
                }

                // run db hooks
                if (this.#dbHooks?.[collection]?.['afterDelete']) {
                  await this.#dbHooks?.[collection]?.['afterDelete']({
                    doc: doc as CollectionSchema[keyof CollectionSchema],
                  });
                }
              },
            };

          broadcast[operationType]();
        }
      );
    }
  }

  #cleanValue(collection: string, entry: Record<string, unknown>) {
    const schema = this.#schema[collection];
    const value: Record<string, unknown> = {};
    const schemaFields = Object.entries((schema as any).shape);

    for (const [key, entryValue] of Object.entries(entry)) {
      const field = schemaFields.find(([fieldKey]) => fieldKey === key);
      if (field) {
        const [, fieldValue] = field;
        const description = (fieldValue as any).description || '{}';
        const { sync } = JSON.parse(description);
        if (sync !== false) {
          value[key] = entryValue;
        }
      }
    }
    return value;
  }

  #extractCollectionOptions(collection: string) {
    const schema = this.#schema[collection];
    const description = (schema as any).description || '{}';
    return JSON.parse(description);
  }

  /**
   * listen to mongo change stream
   * and notify the clients about the changes
   */
  async ready() {
    try {
      /**
       * start mongo db if there's no instance
       */
      if (!this.#db) {
        const client = new MongoClient(this.#mongoURI);
        await client.connect();
        this.#db = client.db();
        this.#dbAttachHandlers();
      }

      /**
       * create indexes
       */
      await this.#createIndexes();

      /**
       * start live sync
       */
      this.#liveSync();

      /**
       * task scheduler
       */
      await this.#runPendingPointers();
      this.#pendingTasks = interval(1_000 * 60)
        .pipe(
          tap(
            async () => await Promise.allSettled([this.#runPendingPointers()])
          )
        )
        .subscribe();

      /**
       * clock the cache
       */
      this.cache.clock();

      if (this.#inspect) {
        console.log('🦊 Instant Server is ready');
      }
    } catch (error) {
      console.error('🚨 Instant Server failed to start', this.#mongoURI, error);
    }
  }

  /**
   * default server
   * @returns Elysia instance
   */
  public server() {
    const rest = new Elysia({
      name: 'instant',
      prefix: 'sync',
    });

    // @todo add default sync endpoints with basic validation and security
    // @todo add default cloud functions with basic validation and security

    return rest;
  }

  public destroy() {
    this.#pendingPointersBusy = false;
    this.#pendingTasks?.unsubscribe();
    this.#connection.clear();
  }

  public cache = {
    get: <CacheKey extends keyof CacheSchema>(
      key: CacheKey
    ): NonNullable<z.infer<CacheSchema[CacheKey]>> | null => {
      const { value, expiresAt } = this.#cacheStorage.get(key) || {
        expiresAt: 0,
        value: undefined,
      };

      if (!value) {
        return null;
      }

      if (expiresAt < Date.now()) {
        this.#cacheStorage.delete(key);
        return null;
      }

      return value as NonNullable<z.infer<CacheSchema[CacheKey]>>;
    },
    set: async <CacheKey extends keyof CacheSchema>(
      key: CacheKey,
      value: NonNullable<z.infer<CacheSchema[CacheKey]>>,
      {
        // time to live in seconds
        // default to 1h
        ttl = this.#cacheTTL,
      }: {
        ttl?: number;
      } = {}
    ) => {
      const expiresAt = Date.now() + ttl * 1000;
      this.#cacheStorage.set(key, {
        value,
        expiresAt,
      });
      return {
        value,
        expiresAt,
      };
    },
    del: async <CacheKey extends keyof CacheSchema>(key: CacheKey) => {
      this.#cacheStorage.delete(key);
    },
    default: <CacheKey extends keyof CacheSchema>(key: CacheKey) => {
      return Promise.reject('Method not implemented on server');
    },
    populate: async () => {
      return Promise.reject('Method not implemented on server');
    },
    clear: async () => {
      this.#cacheStorage.clear();
    },
    clock: () => {
      const now = Date.now();

      for (const [key, value] of this.#cacheStorage) {
        if (value.expiresAt < now) {
          if (this.#inspect) {
            console.log('🧹 cache removed', key);
          }
          this.#cacheStorage.delete(key);
        }
      }

      setTimeout(this.cache.clock.bind(this), this.#cacheTTL * 1000);
    },
  };

  /**
   * collection sync handler
   */
  public collection = {
    derive: () => {
      return ({
        headers,
        params,
      }: {
        headers: Record<string, string | undefined>;
        params: any;
      }) => {
        const auth = headers['authorization'];
        const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
        const { collection } = params;
        return {
          collection,
          session: {
            token,
            user: undefined,
          },
        } as {
          collection: keyof CollectionSchema;
          session: DerivedSession;
        };
      };
    },
    beforeHandle: () => {
      return async ({
        session,
        headers,
        set,
        query,
        body,
        collection,
        jwt,
      }: {
        collection: keyof CollectionSchema;
        session: DerivedSession;
        headers: Record<string, string | undefined>;
        set: SetOptions;
        query: Record<string, string | undefined>;
        body: unknown;
        jwt: JWT;
      }) => {
        // check token
        if (!session.token) {
          set.status = 401;
          return new InstaError({
            status: 401,
            type: 'unauthorized',
            message: 'Unauthorized',
            summary: 'You are not authorized to access this resource',
          }).toJSON();
        }

        // validate collection
        if (!this.collections.includes(collection as string)) {
          set.status = 400;
          return new InstaError({
            status: 400,
            type: 'bad_request',
            message: 'Collection not found',
            summary: 'The collection you are trying to retrieve was not found.',
          }).toJSON();
        }

        let validation: InstaErrorParams<CloudSchema>;

        // validate headers
        validation = await this.validateHeaders(
          'sync',
          headers,
          InstaSyncHeadersSchema
        );

        if (validation.type) {
          set.status = validation.status;
          return validation;
        }

        // validate query
        if (query) {
          const querySchema = z.object({
            synced: z.string().optional(),
            activity: z.enum(['recent', 'oldest']).optional(),
          });
          validation = await this.validateQuery(query, querySchema);
          if (validation.type) {
            set.status = validation.status;
            return validation;
          }
        }

        // validate the body
        if (body) {
          validation = await this.validateBody(collection as string, body, {
            strict: false,
          });
          if (validation.type) {
            set.status = validation.status;
            return validation;
          }
        }

        // check cached token in memory to speed up things
        const cachedSession = this.cache.get(`session:${session.token}`);

        if (!cachedSession) {
          // verify token
          const { sessionId, userId } = await jwt.verify(session.token);

          if (!sessionId || !userId) {
            set.status = 401;
            return new InstaError({
              status: 401,
              type: 'unauthorized',
              message: 'Unauthorized',
              summary: 'You are not authorized to access this resource',
            }).toJSON();
          }

          // fetch session from db
          const in2min = new Date(Date.now() + 2 * 60 * 1000);
          const { sessions } = await this.query({
            sessions: {
              $include: ['user'],
              $filter: {
                _id: { $eq: sessionId },
                _expires_at: { $gt: in2min },
              },
            },
          });

          const actualSession = sessions[0];

          if (!actualSession || !actualSession.user) {
            set.status = 401;
            return new InstaError({
              status: 401,
              type: 'unauthorized',
              message: 'Unauthorized',
              summary: 'You are not authorized to access this resource',
            }).toJSON();
          }

          // cache the actual session
          this.cache.set(`session:${session.token}`, {
            token: actualSession.token,
            user: actualSession.user,
            _expires_at: actualSession._expires_at,
            _id: actualSession._id,
          });

          session.user = actualSession.user;
          session.token = actualSession.token;
          session._expires_at = actualSession._expires_at;
          session._id = actualSession._id;

          if (this.#inspect) {
            console.log('session cache miss', session._id);
          }
        } else {
          session.user = cachedSession.user;
          session.token = cachedSession.token;
          session._expires_at = cachedSession._expires_at;
          session._id = cachedSession._id;

          if (this.#inspect) {
            console.log('session cache hit', session._id);
          }
        }
      };
    },
    get: () => {
      return ({
        params,
        query,
        set,
        session,
      }: {
        params: Record<string, string>;
        query: InstaSyncHeaders;
        set: SetOptions;
        session: DerivedSession;
      }) => {
        return this.#getData({ params, query, set, session });
      };
    },
    post: () => {
      return ({
        params,
        set,
        body,
        session,
      }: {
        params: Record<string, string>;
        set: SetOptions;
        body: Document;
        session: DerivedSession;
      }) => this.#postData({ params, set, body, session });
    },
    put: () => {
      return ({
        params,
        set,
        body,
        session,
      }: {
        params: Record<string, string>;
        set: SetOptions;
        body: Document;
        session: DerivedSession;
      }) => this.#putData({ params, set, body, session });
    },
    delete: () => {
      return ({
        params,
        set,
        session,
      }: {
        params: Record<string, string>;
        set: SetOptions;
        session: DerivedSession;
      }) => this.#deleteData({ params, set, session });
    },
  };

  /**
   * cloud functions handler
   */
  public cloud = {
    derive: () => {
      return ({
        headers,
        params,
      }: {
        headers: Record<string, string | undefined>;
        params: any;
      }) => {
        const auth = headers['authorization'];
        const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
        const { fn } = params;
        return {
          fn,
          session: {
            token,
            user: undefined,
          },
        } as {
          fn: keyof CloudSchema['body'];
          session: DerivedSession;
        };
      };
    },
    beforeHandle: () => {
      return async ({
        session,
        headers,
        set,
        query,
        body,
        fn,
        jwt,
      }: {
        fn: keyof CloudSchema['body'];
        session: DerivedSession;
        headers: Record<string, string | undefined>;
        set: SetOptions;
        query: Record<string, string | undefined>;
        body: unknown;
        jwt: JWT;
      }) => {
        const fnExists = this.functions.find(
          (availableFn) => availableFn === fn
        );

        if (!fnExists || !this.#cloud[fn as string]) {
          set.status = 404;
          return new InstaError({
            status: 404,
            type: 'not_found',
            message: 'Function not found',
            summary: 'The function you are trying to call does not exist',
            errors: [],
            fn,
          }).toJSON();
        }

        const fnSchema = this.#cloudSchema[fn];

        if (!fnSchema) {
          set.status = 400;
          return new InstaError({
            status: 400,
            type: 'bad_request',
            message: 'Function schema not found',
            summary: 'The function you are trying to call is not valid',
            errors: [],
            fn,
          }).toJSON();
        }

        // validate headers
        const headersSchema = this.#cloudHeaders[fn];
        if (headersSchema) {
          const validation = await this.validateHeaders(
            fn as string,
            headers,
            headersSchema
          );
          if (validation.type) {
            set.status = validation.status;
            return validation;
          }
        }

        // validate token if not public
        const { public: isPublic } = JSON.parse(fnSchema.description || '{}');

        if (!isPublic && !session.token) {
          set.status = 401;
          return new InstaError({
            status: 401,
            type: 'unauthorized',
            message: 'Unauthorized',
            summary: 'You are not authorized to call this function',
            errors: [],
            fn,
          }).toJSON();
        }

        // validate body
        let validation = await this.validateFunctionBody(
          fn as string,
          body,
          fnSchema
        );

        if (validation.type) {
          set.status = validation.status;
          return validation;
        }

        if (!isPublic && session.token) {
          // check cached token in memory to speed up things
          const cachedSession = this.cache.get(`session:${session.token}`);

          if (!cachedSession) {
            // verify token
            const { sessionId, userId } = await jwt.verify(session.token);

            if (!sessionId || !userId) {
              set.status = 401;
              return new InstaError({
                status: 401,
                type: 'unauthorized',
                message: 'Unauthorized',
                summary: 'You are not authorized to access this resource',
              }).toJSON();
            }

            // fetch session from db
            const in2min = new Date(Date.now() + 2 * 60 * 1000);
            const { sessions } = await this.query({
              sessions: {
                $include: ['user'],
                $filter: {
                  _id: { $eq: sessionId },
                  _expires_at: { $gt: in2min },
                },
              },
            });

            const actualSession = sessions[0];

            if (!actualSession || !actualSession.user) {
              set.status = 401;
              return new InstaError({
                status: 401,
                type: 'unauthorized',
                message: 'Unauthorized',
                summary: 'You are not authorized to access this function',
              }).toJSON();
            }

            // cache the actual session
            this.cache.set(`session:${session.token}`, {
              token: actualSession.token,
              user: actualSession.user,
              _expires_at: actualSession._expires_at,
              _id: actualSession._id,
            });

            session.user = actualSession.user;
            session.token = actualSession.token;
            session._expires_at = actualSession._expires_at;
            session._id = actualSession._id;

            if (this.#inspect) {
              console.log('session cache miss', session._id);
            }
          } else {
            session.user = cachedSession.user;
            session.token = cachedSession.token;
            session._expires_at = cachedSession._expires_at;
            session._id = cachedSession._id;

            if (this.#inspect) {
              console.log('session cache hit', session._id);
            }
          }
        }
      };
    },
    // function execution is only possible via elysia post
    // this is to ensure the function is properly validated and executed one way client -> server
    post: () => {
      return async ({
        headers,
        params,
        set,
        body,
        fn,
        session,
      }: {
        headers: Record<string, string | undefined>;
        params: Record<string, string>;
        set: SetOptions;
        body: Document;
        fn: keyof CloudSchema['body'];
        session: DerivedSession;
      }) => {
        try {
          const result =
            (await this.#cloud[fn as string]({
              headers,
              params,
              set,
              body,
              session,
            })) || {};

          // validate response
          const responseSchema = this.#cloudResponse[fn];
          if (responseSchema) {
            const validation = await this.validateFunctionResponse(
              fn as string,
              result,
              responseSchema
            );

            if (validation.type) {
              set.status = validation.status;
              return validation;
            }
          }

          return result;
        } catch (err: any) {
          if (err instanceof Error) {
            set.status = 500;
            return err;
          }

          if (err?.type) {
            set.status = err.status;
            return { ...err, fn: params['fn'] };
          }

          set.status = 500;
          return new InstaError({
            status: 500,
            type: 'internal_server_error',
            message: 'Function execution failed',
            summary: 'There was an error while executing this request.',
            errors: [],
            fn: params['fn'],
          }).toJSON();
        }
      };
    },
    addFunction: <K extends keyof CloudSchema['body']>(
      name: K,
      fn: (args: {
        body: z.infer<CloudSchema['body'][K]>;
        headers: z.infer<CloudSchema['headers'][K]>;
        set: SetOptions;
      }) => Promise<z.infer<CloudSchema['response'][K]>>
    ) => {
      this.#cloud[name as string] = fn;
    },
    removeFunction: <K extends keyof CollectionSchema>(name: K) => {
      delete this.#cloud[name as string];
    },
    addHook: <A extends CloudHookAction, C extends keyof CollectionSchema>(
      action: A,
      collection: C,
      fn: (data: {
        session?: string | undefined; // @todo
        before?: z.infer<CollectionSchema[C]> | undefined;
        doc: z.infer<CollectionSchema[C]>;
      }) => A extends 'beforeSave'
        ? Promise<z.infer<CollectionSchema[C]>>
        : Promise<void>
    ) => {
      if (!this.#cloudHooks) {
        this.#cloudHooks = {} as any;
      }
      if (!this.#cloudHooks?.[collection]) {
        this.#cloudHooks![collection] = {} as any;
      }
      if (!this.#cloudHooks?.[collection]?.[action]) {
        this.#cloudHooks![collection][action] = fn as any;
      }
    },
    removeHook: <Y extends CloudHookAction, K extends keyof CollectionSchema>(
      name: Y,
      collection: K
    ) => {
      delete this.#cloudHooks![collection][name];
    },
  };

  /**
   * live sync handler
   * @returns Elysia handler
   */
  public live = () => ({
    beforeHandle: async (ws: any) => {
      try {
        const url = new URL(ws.url);
        const token = url.searchParams.get('session');
        if (!token) {
          ws.close();
          return new InstaError({
            status: 401,
            type: 'unauthorized',
            message: 'Unauthorized',
            summary: 'You are not authorized to access this resource',
          }).toJSON();
        }

        // check cached token in memory to speed up things
        const cachedSession = this.cache.get(`session:${token}`);

        if (!cachedSession) {
          // verify token
          const { sessionId, userId } = await ws.jwt.verify(token);

          if (!sessionId || !userId) {
            ws.close();
            return new InstaError({
              status: 401,
              type: 'unauthorized',
              message: 'Unauthorized',
              summary: 'You are not authorized to access this resource',
            }).toJSON();
          }

          // fetch session from db
          const in2min = new Date(Date.now() + 2 * 60 * 1000);
          const { sessions } = await this.query({
            sessions: {
              $include: ['user'],
              $filter: {
                _id: { $eq: sessionId },
                _expires_at: { $gt: in2min },
              },
            },
          });

          const actualSession = sessions[0];

          if (!actualSession || !actualSession.user) {
            ws.close();
            return new InstaError({
              status: 401,
              type: 'unauthorized',
              message: 'Unauthorized',
              summary: 'You are not authorized to access this function',
            }).toJSON();
          }

          // cache the actual session
          this.cache.set(`session:${token}`, {
            token: actualSession.token,
            user: actualSession.user,
            _expires_at: actualSession._expires_at,
            _id: actualSession._id,
          });

          if (this.#inspect) {
            console.log('live session cache miss', actualSession._id);
          }
        } else {
          if (this.#inspect) {
            console.log('live session cache hit', cachedSession._id);
          }
        }
      } catch (err) {
        console.log('live beforeHandle error', err);
        ws.close();
      }
    },
    open: (
      // eslint-disable-next-line  @typescript-eslint/no-explicit-any
      ws: ElysiaWS<any, any, any>
    ) => {
      const id = ws.id;
      const query = ws.data['query'];
      const constraints = this.#constraints || [];
      const identifiers = this.#buildIdentifiers({ query, constraints });

      if (identifiers.length <= 0 || identifiers[0] === 'broadcast') {
        if (this.#inspect) {
          console.log(
            '🚨 no constraints found. the sync will be broadcast to everyone.'
          );
        }
      }

      // in case the identifier
      for (const identifier of identifiers) {
        this.#connection.set(identifier, {
          clients: [...(this.#connection.get(identifier)?.clients || []), ws],
        });
      }

      if (this.#inspect) {
        console.log('sync open connection:', id, identifiers);
        console.log('sync open connection pool:', this.#connection.size);
        for (const identifier of identifiers) {
          console.log(
            'sync open connection clients for',
            identifier,
            this.#connection.get(identifier)?.clients.length
          );
        }
      }
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    close: (ws: ElysiaWS<any, any, any>) => {
      const id = ws.id;
      const query = ws.data['query'];
      const constraints = this.#constraints || [];

      const identifiers = this.#buildIdentifiers({ query, constraints });

      for (const identifier of identifiers) {
        const connection = this.#connection.get(identifier);
        if (connection) {
          connection.clients = connection.clients.filter(
            (client) => client.id !== id
          );
          if (connection.clients.length === 0) {
            this.#connection.delete(identifier);
          }
        }
      }

      if (this.#inspect) {
        console.log('sync closed connection:', id);
        console.log('sync open connection pool:', this.#connection.size);
        for (const identifier of identifiers) {
          console.log(
            'sync open connection clients:',
            this.#connection.get(identifier)?.clients.length
          );
        }
      }
    },
    error: (error: unknown) => {
      if (this.#inspect) {
        console.log('sync error', error);
      }
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    message: (ws: ElysiaWS<any, any, any>, message: unknown) => {
      if (this.#inspect) {
        console.log('sync message', message);
      }
    },
  });

  public auth = {
    signIn: async ({
      email,
      password,
    }: {
      email: z.infer<typeof InstaUserEmailSchema>;
      password: string;
    }) => {
      const user = await this.db
        .collection('users')
        .findOne({ email: email.toLowerCase() });
      if (!user) {
        return Promise.reject(
          new InstaError({
            status: 401,
            type: 'unauthorized',
            message: 'Unauthorized',
            summary: 'The email or password is incorrect',
            errors: [],
            fn: 'signIn',
          }).toJSON()
        );
      }

      const passwordMatch = await compare(password, user['_password']);

      if (!passwordMatch) {
        return Promise.reject(
          new InstaError({
            status: 401,
            type: 'unauthorized',
            message: 'Unauthorized',
            summary: 'The email or password is incorrect',
            errors: [],
            fn: 'signIn',
          }).toJSON()
        );
      }

      return await this.auth.createSession({
        user: user as unknown as InstaUser,
      });
    },
    signUp: async ({
      name,
      email,
      password,
    }: {
      name: string;
      email: z.infer<typeof InstaUserEmailSchema>;
      password: string;
    }) => {
      const user = await this.db
        .collection('users')
        .findOne({ email: email.toLowerCase() });
      if (user) {
        return Promise.reject(
          new InstaError({
            status: 400,
            type: 'validation_error',
            message: 'Email already exists',
            summary: 'The email provided already exists.',
            errors: [],
            fn: 'signUp',
          }).toJSON()
        );
      }
      const now = new Date();
      const newUser = {
        _id: newObjectId(),
        name,
        email: email.toLowerCase(),
        _password: await hash(password),
        _created_at: now,
        _updated_at: now,
      };

      await this.db.collection('users').insertOne(newUser as Document, {
        forceServerObjectId: false,
      });

      return await this.auth.createSession({
        user: newUser as unknown as InstaUser,
      });
    },
    signOut: async ({ token }: { token: string }) => {
      const now = new Date();
      const in2min = new Date(
        new Date().setMinutes(new Date().getMinutes() + 2)
      );

      // issue a soft delete so that db hook listeners can be notified
      await this.db.collection('sessions').updateOne(
        { token },
        {
          $set: {
            _updated_at: now,
            _expires_at: in2min,
          },
        }
      );

      this.cache.del(`session:${token}`);
    },
    createSession: async ({
      user,
      nbf,
      exp = new Date().setFullYear(new Date().getFullYear() + 1),
      ...rest
    }: {
      user: InstaUser;
    } & JWTPayloadSpec) => {
      /**
       * generate a new session token
       */
      const userId = user._id;
      const sessionId = newObjectId();
      const key = new TextEncoder().encode(this.#secret);

      let jwt = new SignJWT({
        ...rest,
        userId,
        sessionId,
        nbf: undefined,
        exp: undefined,
      }).setProtectedHeader({
        alg: 'HS256',
        crit: undefined,
      });

      if (nbf) jwt = jwt.setNotBefore(nbf);
      if (exp) jwt = jwt.setExpirationTime(exp);

      const token = await jwt.sign(key);
      const now = new Date();

      const session = {
        _id: sessionId,
        _p_user: pointer('users', userId),
        _expires_at: new Date(exp),
        _created_at: now,
        _updated_at: now,
        token,
      };

      await this.db.collection('sessions').insertOne(session as Document, {
        forceServerObjectId: false,
      });

      return {
        ...this.#cleanValue('sessions', session),
        user: this.#cleanValue('users', user),
      } as unknown as InstaSession;
    },
  };

  public async validate(
    collection: keyof CollectionSchema,
    data: unknown,
    { strict = true } = {}
  ) {
    const schema = this.#schema[collection];

    try {
      if (strict) {
        await (schema as any).strict().parseAsync(data);
      } else {
        await (schema as any).parseAsync(data);
      }
    } catch (zodError) {
      if (zodError instanceof z.ZodError) {
        return new InstaError<CloudSchema>({
          status: 400,
          type: 'validation_error',
          message: 'Invalid data provided',
          summary: `The data provided for ${singular(
            collection as string
          )} is not valid.`,
          errors: zodError.errors.map((err) => ({
            path: err.path.join('.'),
            message: err.message,
          })),
        }).toJSON();
      }
    }

    return {} as InstaErrorParams<CloudSchema>;
  }

  public async validateQuery(query: unknown, schema: z.ZodType<any, any, any>) {
    try {
      await (schema as z.ZodObject<any>).parseAsync(query);
    } catch (zodError) {
      if (zodError instanceof z.ZodError) {
        return new InstaError<CloudSchema>({
          status: 400,
          type: 'validation_error',
          message: 'Invalid query',
          summary: 'The query provided is not valid.',
          errors: zodError.errors.map((err) => ({
            path: err.path.join('.'),
            message: err.message,
          })),
        }).toJSON();
      }
      throw zodError;
    }

    return {} as InstaErrorParams<CloudSchema>;
  }

  public async validateBody(
    collection: string,
    data: unknown,
    {
      strict = true,
    }: {
      strict?: boolean;
    } = {}
  ) {
    const schema = this.#schema[collection];

    try {
      // validate the body
      if (strict) {
        await (schema as z.ZodObject<any>).strict().parseAsync(data);
      } else {
        await (schema as z.ZodObject<any>).partial().parseAsync(data);
      }
    } catch (zodError) {
      if (zodError instanceof z.ZodError) {
        return new InstaError<CloudSchema>({
          status: 400,
          type: 'validation_error',
          message: 'Invalid data',
          summary: `The data provided for ${singular(
            collection
          )} is not valid.`,
          errors: zodError.errors.map((err) => ({
            path: err.path.join('.'),
            message: err.message,
          })),
        }).toJSON();
      }
      throw zodError; // Re-throw if it's not a ZodError
    }

    return {} as InstaErrorParams<CloudSchema>;
  }

  public async validateFunctionBody(
    name: string,
    body: unknown,
    schema: z.ZodType<any, any, any>
  ) {
    try {
      await (schema as z.ZodObject<any>).strict().parseAsync(body);
    } catch (zodError) {
      if (zodError instanceof z.ZodError) {
        return new InstaError<CloudSchema>({
          status: 400,
          type: 'validation_error',
          message: 'Invalid data provided',
          summary: `The data provided for ${name} is not valid.`,
          errors: zodError.errors.map((err) => ({
            path: err.path.join('.'),
            message: err.message,
          })),
          fn: name,
        }).toJSON();
      }
      throw zodError; // Re-throw if it's not a ZodError
    }

    return {} as InstaErrorParams<CloudSchema>;
  }

  public async validateFunctionResponse(
    name: string,
    body: unknown,
    schema: z.ZodType<any, any, any>
  ) {
    try {
      await (schema as z.ZodObject<any>).parseAsync(body);
    } catch (zodError) {
      if (zodError instanceof z.ZodError) {
        return new InstaError<CloudSchema>({
          status: 500,
          type: 'bad_response',
          message: 'Invalid response',
          summary: `Server generated an invalid response for ${name}.`,
          errors: zodError.errors.map((err) => ({
            path: err.path.join('.'),
            message: err.message,
          })),
          fn: name,
        }).toJSON();
      }
      throw zodError; // Re-throw if it's not a ZodError
    }

    return {} as InstaErrorParams<CloudSchema>;
  }

  public async validateHeaders(
    name: string,
    headers: unknown,
    schema: z.ZodType<any, any, any>
  ) {
    try {
      await (schema as z.ZodObject<any>).parseAsync(headers);
    } catch (zodError) {
      if (zodError instanceof z.ZodError) {
        return new InstaError<CloudSchema>({
          fn: name,
          status: 400,
          type: 'bad_headers',
          message: 'Invalid headers provided',
          summary: `The headers provided for ${name} is not valid.`,
          errors: zodError.errors.map((err) => ({
            path: err.path.join('.'),
            message: err.message,
          })),
        }).toJSON();
      }
      throw zodError; // Re-throw if it's not a ZodError
    }

    return {} as InstaErrorParams<CloudSchema>;
  }

  async #createIndexes() {
    const collections = Object.keys(this.#schema);
    const mongoCollections = await this.db.listCollections().toArray();

    for (const collection of collections) {
      // if the collections doesn't in mongo, skip
      if (!mongoCollections.find((c) => c.name === collection)) {
        continue;
      }

      const existingIndexes = await this.db.collection(collection).indexes();

      // delete all indexes first (make this an option?)
      // await this.db.collection(collection).dropIndexes();

      const commonPatterns = {
        [collection as any]: {
          most_recent: {
            definition: {
              _updated_at: -1,
            },
          },
          least_recent: {
            definition: {
              _updated_at: 1,
            },
          },
          /**
           * Create `_expires_at` index used for soft deletes.
           * We don't actually delete a document right away, we update its _expires_at field with a `Date` so that clients can be aware of the delete.
           * Then mongo will automatically delete this document once the date is reached.
           * Another reasoning is due to hooks like `afterDelete` where we need the document to be available for linking it back to the consumer.
           */
          soft_delete: {
            definition: {
              _expires_at: 1,
            },
            options: {
              expireAfterSeconds: 0,
            },
          },
          ...this.#index[collection],
        },
        ...this.#index,
      } as IndexDictionary<CollectionSchema>;

      // update the index
      this.#index = {
        ...commonPatterns,
        users: {
          unique_email: {
            definition: {
              email: 1,
            },
            options: {
              unique: true,
            },
          },
          ...commonPatterns['users'],
        },
      };

      // create indexes
      for (const [indexName, indexSpec] of Object.entries(
        commonPatterns[collection] ?? {}
      )) {
        try {
          // Check if index exists
          const indexExists = existingIndexes.some(
            (index) => index.name === indexName
          );

          if (!indexExists) {
            await this.db
              .collection(collection)
              .createIndex(indexSpec.definition, {
                name: indexName,
                ...indexSpec.options,
              });
            console.log(`🔎 Created index ${indexName} for ${collection}`);
          }
        } catch (error) {
          console.error(
            `❌ Failed to create index ${indexName} for ${collection}:`,
            error
          );
        }
      }
    }
  }

  async #getData({
    params,
    query,
    set,
    session, // @todo implement hooks for before and after get
  }: {
    params: Record<string, string>;
    query: InstaSyncHeaders;
    set: SetOptions;
    session: DerivedSession;
  }) {
    const { collection } = params;
    const { activity, synced_at, limit = 100 } = query;

    const maxLimit = Math.min(limit, this.#maxBatchSize);

    try {
      const operator = activity === 'oldest' ? '$lt' : '$gt';
      const constraints = this.#constraints || [];

      // determine the constraint key and value to be used in the mongo query
      // based on the query params. it can be multiple constraints
      // eg: ?synced=2024-01-01&activity=recent&org=orgId&user=userId
      // where the constraints are `org` and `user`
      const constraintsQuery = constraints.reduce((acc, constraint) => {
        const value = query[constraint.key as keyof typeof query];
        if (typeof value === 'string' && !value.includes(',')) {
          const pKey = !constraint.key.startsWith('_p_')
            ? `_p_${constraint.key}`
            : constraint.key;

          acc[pKey] = pointer(constraint.collection, String(value));
        }

        if (typeof value === 'string' && value.includes(',')) {
          const singularKey = singular(constraint.key);

          acc[`_p_${singularKey}`] = {
            $in: value
              .split(',')
              .map((id: string) => pointer(constraint.collection, id)),
          };
        }

        return acc;
      }, {} as Record<string, string | { $in: string[] }>);

      // console.log('constraintsQuery', constraintsQuery);
      // console.log('constraints', constraints);

      // throw if the constraints defined don't match the query
      if (Object.keys(constraintsQuery).length !== constraints.length) {
        set.status = 400;
        return new InstaError({
          status: 400,
          type: 'bad_request',
          summary: 'Params mismatch',
          message:
            'There is a mismatch between the params and constraints. Ensure that the params defined in the constraints are the same as the ones used in the sync method.',
        }).toJSON();
      }

      // try to determine the collection _id field name
      const collectionNameSingular = singular(collection).toLowerCase();
      const collectionOwnIdField = constraintsQuery[
        `_p_${collectionNameSingular}`
      ] as string | { $in: string[] };

      let constraintsQueryWithoutCollectionId:
        | Record<string, string | { $in: string[] }>
        | undefined = undefined;

      let collectionIdFieldValue: string | string[] = '';

      if (
        collectionOwnIdField &&
        typeof collectionOwnIdField === 'object' &&
        '$in' in collectionOwnIdField
      ) {
        // account to multiple constraints
        // and use the $in operator to filter the data
        collectionIdFieldValue = (collectionOwnIdField as { $in: string[] })
          .$in;
        constraintsQueryWithoutCollectionId = Object.entries(
          constraintsQuery
        ).reduce<Record<string, string | { $in: string[] }>>(
          (acc, [key, value]) => {
            if (key !== `_p_${collectionNameSingular}`) {
              acc[key] = value;
            }
            return acc;
          },
          {} as Record<string, string | { $in: string[] }>
        );
      }

      const collectionIdFieldWithoutPointers = Object.entries(
        collectionOwnIdField || {}
      ).reduce<Record<string, string | string[]>>((acc, [key, value]) => {
        if (typeof value === 'string' && value.includes('$')) {
          acc[key] = value.split('$')[1];
        } else if (Array.isArray(value)) {
          acc[key] = value.map((id) =>
            typeof id === 'string' && id.includes('$') ? id.split('$')[1] : id
          );
        }
        return acc;
      }, {});

      const filter = {
        ...(collectionIdFieldValue
          ? {
              $or: [
                {
                  ...(synced_at
                    ? { _updated_at: { [operator]: new Date(synced_at) } }
                    : {}),
                  ...constraintsQuery,
                },
                {
                  ...(synced_at
                    ? { _updated_at: { [operator]: new Date(synced_at) } }
                    : {}),
                  ...(constraintsQueryWithoutCollectionId || constraintsQuery),
                  _id: collectionIdFieldWithoutPointers,
                },
              ],
            }
          : {
              ...(synced_at
                ? { _updated_at: { [operator]: new Date(synced_at) } }
                : {}),
              ...constraintsQuery,
            }),
      };

      const count = await this.db.collection(collection).countDocuments(filter);

      const data = await this.db
        .collection(collection)
        .find(filter)
        .sort({ _updated_at: activity === 'oldest' ? -1 : 1 })
        .limit(maxLimit)
        .toArray();

      const nextSynced = data[data.length - 1]?.['_updated_at'].toISOString();

      set.status = 200;

      return {
        collection,
        count,
        activity,
        synced_at: nextSynced || synced_at || new Date().toISOString(),
        data: data.map((entry) => {
          const expiresAt = entry['_expires_at']?.toISOString();
          const updatedAt = entry['_updated_at'].toISOString();
          const createdAt = entry['_created_at'].toISOString();

          const status: SyncStatus = expiresAt
            ? 'deleted'
            : updatedAt !== createdAt
            ? 'updated'
            : 'created';

          // cleanup value props with sync: false according to the schema
          const value = this.#cleanValue(collection, entry);

          return {
            status,
            value,
          };
        }),
      } as SyncResponse;
    } catch (error) {
      console.error('sync error', error);
      set.status = 500;
      return new InstaError({
        status: 500,
        type: 'internal_server_error',
        summary: `An error occurred while syncing ${collection}`,
        message:
          'We were not able to process your request. Please try again later or contact support.',
      }).toJSON();
    }
  }

  async #postData({
    params,
    set,
    body,
    session,
  }: {
    params: Record<string, string>;
    set: SetOptions;
    body: Document;
    session: DerivedSession;
  }) {
    const { collection } = params;

    try {
      // check for unique index fields so we can return a nice error
      // in case the record already exists
      const index = this.#index[collection] || {};

      const indexedUniqueFields = Object.entries(index ?? {}).filter(
        ([key, value]) => value.options?.unique
      );

      const extractedUniqueFields = indexedUniqueFields.map(([key, value]) => {
        return Object.keys(value.definition)[0];
      });

      // make a query to check for existing records with the same unique fields
      if (extractedUniqueFields.length) {
        const existingRecord = await this.db.collection(collection).findOne({
          $or: extractedUniqueFields.map((field) => ({
            [field]: body[field],
          })),
        });

        if (existingRecord) {
          set.status = 400;
          return new InstaError({
            status: 400,
            type: 'bad_request',
            summary: 'Document already exists',
            message: `A ${collection} document already exists with the same fields.`,
            errors: extractedUniqueFields.map((field) => ({
              path: field,
              message: existingRecord[field],
            })),
          }).toJSON();
        }
      }

      let newDoc = omit(body, ['_id', '_created_at', '_updated_at']);
      const now = new Date();

      if (body['_id']?.includes('-')) {
        newDoc['_uuid'] = body['_id'];
      }

      newDoc['_id'] = newObjectId();

      // run cloud hooks
      if (this.#cloudHooks?.[collection]?.['beforeSave']) {
        newDoc = await this.#cloudHooks?.[collection]?.['beforeSave']({
          before: undefined,
          doc: newDoc as CollectionSchema[keyof CollectionSchema],
          session,
        });
      }

      // enforce _updated_at by the server
      newDoc['_created_at'] = now;
      newDoc['_updated_at'] = now;

      if (newDoc['_sync']) {
        delete newDoc['_sync'];
      }

      if (newDoc['_expires_at']) {
        newDoc['_expires_at'] = new Date(newDoc['_expires_at']);
      }

      await this.db.collection(collection).insertOne(
        { ...newDoc },
        {
          forceServerObjectId: false,
        }
      );

      // run cloud hooks
      if (this.#cloudHooks?.[collection]?.['afterSave']) {
        await this.#cloudHooks?.[collection]?.['afterSave']({
          before: undefined,
          doc: newDoc as CollectionSchema[keyof CollectionSchema],
          session,
        });
      }

      // cleanup value props with sync: false according to the schema
      const value = this.#cleanValue(collection, newDoc);
      return {
        value,
        updatedFields: {},
      };
    } catch (error) {
      console.error('sync error', error);
      set.status = 500;

      return new InstaError({
        status: 500,
        type: 'internal_server_error',
        summary: `An error occurred while syncing ${collection}`,
        message:
          'We were not able to process your request. Please try again later or contact support.',
      }).toJSON();
    }
  }

  async #putData({
    params,
    set,
    body,
    session,
  }: {
    params: Record<string, string>;
    set: SetOptions;
    body: Document;
    session: DerivedSession;
  }) {
    try {
      const { collection, id } = params;

      if (!id) {
        set.status = 400;

        return new InstaError({
          status: 400,
          type: 'bad_request',
          summary: 'Document required',
          message: 'The document id is required for update.',
        }).toJSON();
      }

      let nextDoc = omit(body, ['_id', '_created_at', '_updated_at']);

      if (nextDoc['_sync']) {
        delete nextDoc['_sync'];
      }
      const currentDoc: any = await this.db.collection(collection).findOne({
        $or: [{ _id: id as unknown as ObjectId }, { _uuid: id }],
      });

      // if doc doesn't exist and id is an uuid, create it
      if (isEmpty(currentDoc) && id.includes('-')) {
        return this.#postData({
          params,
          set,
          body,
          session,
        });
      }

      if (isEmpty(currentDoc)) {
        set.status = 404;
        return new InstaError({
          status: 404,
          type: 'not_found',
          summary: 'Document not found',
          message: 'The document you are trying to update was not found.',
        }).toJSON();
      }

      // check for unique index fields so we can return a nice error
      // in case the record already exists
      const index = this.#index[collection] || {};

      const indexedUniqueFields = Object.entries(index ?? {}).filter(
        ([key, value]) => value.options?.unique
      );

      const extractedUniqueFields = indexedUniqueFields.map(([key, value]) => {
        return Object.keys(value.definition)[0];
      });

      if (extractedUniqueFields.length) {
        // make a query to check for existing records with the same unique fields
        const existingRecord = await this.db.collection(collection).findOne({
          $or:
            extractedUniqueFields.map((field) => ({
              [field]: body[field],
            })) || [],
        });

        if (existingRecord) {
          set.status = 400;
          return new InstaError({
            status: 400,
            type: 'bad_request',
            summary: 'Document already exists',
            message: `A ${collection} document already exists with the same fields.`,
            errors: extractedUniqueFields.map((field) => ({
              path: field,
              message: existingRecord[field],
            })),
          }).toJSON();
        }
      }

      // run cloud hooks
      if (this.#cloudHooks?.[collection]?.['beforeSave']) {
        nextDoc = await this.#cloudHooks?.[collection]?.['beforeSave']({
          before: currentDoc as any,
          doc: { ...currentDoc, ...nextDoc } as any,
          session,
        });
      }

      // enforce _updated_at by the server
      nextDoc['_updated_at'] = new Date();

      await this.db.collection(collection).updateOne(
        {
          $or: [{ _id: id as unknown as ObjectId }, { _uuid: id }],
        },
        { $set: nextDoc },
        { upsert: false }
      );

      // run cloud hooks
      if (this.#cloudHooks?.[collection]?.['afterSave']) {
        await this.#cloudHooks?.[collection]?.['afterSave']({
          before: currentDoc as any,
          doc: { ...currentDoc, ...nextDoc } as any,
          session,
        });
      }

      // cleanup value props with sync: false according to the schema
      const value = this.#cleanValue(collection, nextDoc);
      const updatedFields = this.#updatedFields(currentDoc, nextDoc);

      return {
        value,
        updatedFields,
      };
    } catch (error) {
      console.error('sync error', error);
      set.status = 500;

      return new InstaError({
        status: 500,
        type: 'internal_server_error',
        summary: 'An error occurred while syncing',
        message: 'We were not able to process your request.',
      }).toJSON();
    }
  }

  async #deleteData({
    params,
    set,
    session,
  }: {
    params: Record<string, string>;
    set: SetOptions;
    session: DerivedSession;
  }) {
    const { collection, id } = params;
    try {
      if (!id) {
        set.status = 400;

        return new InstaError({
          status: 400,
          type: 'bad_request',
          summary: 'Document required',
          message: 'The document id is required for deletion.',
        }).toJSON();
      }

      const doc = await this.db.collection(collection).findOne({
        $or: [{ _id: id as unknown as ObjectId }, { _uuid: id }],
      });

      if (isEmpty(doc)) {
        set.status = 404;

        return new InstaError({
          status: 404,
          type: 'not_found',
          summary: 'Document not found',
          message: 'The document you are trying to delete was not found.',
        }).toJSON();
      }

      const now = new Date();
      const in1year = new Date(
        new Date().setFullYear(new Date().getFullYear() + 1)
      );

      const data = {
        _expires_at: in1year,
      };

      // run cloud hooks
      if (this.#cloudHooks?.[collection]?.['beforeDelete']) {
        await this.#cloudHooks?.[collection]?.['beforeDelete']({
          before: doc as any,
          doc: data as any,
          session,
        });
      }

      await this.db.collection(collection).updateOne(
        {
          $or: [{ _id: id as unknown as ObjectId }, { _uuid: id }],
        },
        {
          $set: data,
        },
        { upsert: false }
      );

      // run cloud hooks
      if (this.#cloudHooks?.[collection]?.['afterDelete']) {
        await this.#cloudHooks?.[collection]?.['afterDelete']({
          before: doc as any,
          doc: { ...doc, ...data } as any,
          session,
        });
      }

      return {
        value:{
          _id: id,
          _updated_at: now.toISOString(),
        },
        updatedFields: {},
      };
    } catch (error) {
      console.error('sync error', error);
      set.status = 500;

      return new InstaError({
        status: 500,
        type: 'internal_server_error',
        summary: `An error occurred while syncing ${collection}`,
        message: 'We were not able to process your request.',
      }).toJSON();
    }
  }

  async #runPendingPointers() {
    try {
      if (this.#pendingPointersBusy) {
        return;
      }

      this.#pendingPointersBusy = true;

      const collections = Object.keys(this.#schema);

      for (const collection of collections) {
        // skip collections with no sync
        const { sync } = this.#extractCollectionOptions(collection);
        if (!sync) {
          continue;
        }

        // Extract pointer fields from the schema
        const pointerFields = Object.entries(
          (this.#schema[collection] as z.ZodObject<any>).shape
        )
          .filter(
            ([key, value]) =>
              key.startsWith('_p_') &&
              (value instanceof z.ZodString || value instanceof z.ZodOptional)
          )
          .map(([key]) => key);

        // Build the query
        if (pointerFields.length > 0) {
          const query = this.db.collection(collection).find({
            $or: pointerFields.map((field) => ({
              [field]: {
                $type: 'string',
                $regex: /[-]/, // Matches strings containing '-'
              },
            })),
          });

          const data = await query.toArray();

          // replace any pending pointers with the actual data
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
              const pointerData = await this.db
                .collection(pointerCollection)
                .findOne({
                  _uuid: pointerUuid,
                });

              const pointerId = pointerData?._id.toString() || '';

              if (pointerId && pointerData && !pointerId.includes('-')) {
                // update the item in the database
                await this.db.collection(collection).updateOne(
                  { _id: item._id },
                  {
                    $set: {
                      [key]: `${pointerCollection}$${pointerId}`,
                      _updated_at: new Date(),
                    },
                  }
                );
                if (this.#inspect) {
                  console.log('✅ pointer updated', pointerData);
                }
              }
            }
          }
        } else {
          // skip
          continue;
        }
      }
    } catch (err) {
      console.error('error while running pending pointers', err);
    } finally {
      this.#pendingPointersBusy = false;
    }
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
   *       // $by is a special syntax
   *       // the value is a pointer to the author of the post (ie the user: users$objectId)
   *       // when not specified, it will try to match by a pointer _p_user
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
   * console.log(await insta.query(query))
   * // {
   * //   users: [
   * //     {
   * //       _id: 'userObjectId',
   * //       name: 'John Doe',
   * //       email: 'john.doe@example.com',
   * //       posts: [
   * //         {
   * //           _id: 'postObjectId',
   * //           title: 'Post Title',
   * //           content: 'Post Content',
   * //           author: 'users$userObjectId'
   * //         }
   * //       ]
   * //     }
   * //   ]
   * // }
   */
  public async query<Q extends iQL<CollectionSchema>>(
    iql: Q
  ): Promise<{
    [K in keyof Q]: z.infer<CollectionSchema[K & keyof CollectionSchema]>[];
  }> {
    return this.#executeQuery(iql);
  }

  /**
   * mutate data
   * this api is to ensure behavior consistency with cloud hooks which are activated by client requests (ie syncing data)
   * note that the cloud hooks here have no session as there's no user context when mutating data from the server
   * but you can still benefit from structured documents, e2e types and validation
   */
  public mutate<C extends keyof CollectionSchema>(collection: C) {
    return {
      add: async (value: Partial<z.infer<CollectionSchema[C]>>) => {
        const now = new Date();
        let doc = {
          ...(value as unknown as any),
          _created_at: now,
          _updated_at: now,
          _id: newObjectId(),
        };

        // run validation
        const validation = await this.validate(collection, doc);
        const { errors } = validation;
        if (errors) {
          return Promise.reject(validation);
        }

        // run beforeSave hooks
        if (this.#cloudHooks?.[collection]?.beforeSave) {
          doc = await this.#cloudHooks[collection].beforeSave({
            doc,
            before: undefined,
            session: {
              user: undefined,
            },
          });
        }

        await this.db
          .collection(collection as unknown as string)
          .insertOne(doc, {
            forceServerObjectId: false,
          });

        // run afterSave hooks
        if (this.#cloudHooks?.[collection]?.afterSave) {
          await this.#cloudHooks[collection].afterSave({
            before: undefined,
            session: {
              user: undefined,
            },
            doc,
          });
        }

        return doc;
      },
      update: async (
        id: string,
        value: Partial<z.infer<CollectionSchema[C]>>
      ) => {
        const beforeDoc: any = await this.db
          .collection(collection as unknown as string)
          .findOne({ _id: id as unknown as ObjectId });

        if (!beforeDoc) {
          return Promise.reject(
            new InstaError({
              status: 404,
              type: 'not_found',
              summary: 'Document not found',
              message: 'The document you are trying to update was not found.',
            })
          );
        }

        let nextDoc: any = {
          ...value,
          _updated_at: new Date(),
        };

        // run validation
        const validation = await this.validate(collection, nextDoc, {
          strict: false,
        });
        const { errors } = validation;
        if (errors) {
          return Promise.reject(validation);
        }

        // run beforeSave hooks
        if (this.#cloudHooks?.[collection]?.beforeSave) {
          nextDoc = await this.#cloudHooks[collection].beforeSave({
            doc: nextDoc,
            before: beforeDoc,
            session: {
              user: undefined,
            },
          });
        }

        await this.db.collection(collection as string).updateOne(
          { _id: id as unknown as ObjectId },
          {
            $set: nextDoc,
          }
        );

        // run afterSave hooks
        if (this.#cloudHooks?.[collection]?.afterSave) {
          await this.#cloudHooks[collection].afterSave({
            before: beforeDoc,
            doc: { ...beforeDoc, ...nextDoc } as any,
            session: {
              user: undefined,
            },
          });
        }

        return nextDoc;
      },
      delete: async (id: string) => {
        const now = new Date();
        const in1year = new Date(
          new Date().setFullYear(new Date().getFullYear() + 1)
        );

        const beforeDoc: any = await this.db
          .collection(collection as unknown as string)
          .findOne({ _id: id as unknown as ObjectId });

        if (!beforeDoc) {
          return Promise.reject(
            new InstaError({
              status: 404,
              type: 'not_found',
              summary: 'Document not found',
              message: 'The document you are trying to delete was not found.',
            })
          );
        }

        // run beforeDelete hooks
        if (this.#cloudHooks?.[collection]?.beforeDelete) {
          await this.#cloudHooks[collection].beforeDelete({
            before: beforeDoc as any,
            doc: { ...beforeDoc, _expires_at: in1year } as any,
            session: {
              user: undefined,
            },
          });
        }

        await this.db.collection(collection as string).updateOne(
          { _id: id as unknown as ObjectId },
          {
            $set: {
              _updated_at: now,
              _expires_at: in1year,
            },
          }
        );

        // run afterDelete hooks
        if (this.#cloudHooks?.[collection]?.afterDelete) {
          await this.#cloudHooks[collection].afterDelete({
            before: beforeDoc as any,
            doc: {
              ...beforeDoc,
              _expires_at: in1year,
              _updated_at: now,
            } as any,
            session: {
              user: undefined,
            },
          });
        }
      },
    };
  }

  async #executeQuery<TQuery extends iQL<CollectionSchema>>(
    iql: TQuery,
    parentCollection?: keyof CollectionSchema,
    parentId?: string
  ): Promise<{
    [K in keyof TQuery]: z.infer<
      CollectionSchema[K & keyof CollectionSchema]
    >[];
  }> {
    const cache: Map<string, any> = new Map();
    let result: any = {};

    for (const [collection, query] of Object.entries(iql)) {
      if (typeof query !== 'object' || query === null) continue;

      const {
        $limit = 100,
        $skip = 0,
        $sort,
        $filter,
        $or,
        $by,
        $include,
        $aggregate,
        $options,
        $eq,
        ...nestedQueries
      } = query as iQLDirectives<any> & Record<string, any>;

      // Handle $aggregate
      if ($aggregate) {
        const aggregationPipeline = $aggregate; // Use the provided aggregation pipeline
        const options = $options || {}; // Use provided options or default to an empty object

        // Execute the aggregation query
        const aggregationResult = await this.#db
          .collection(collection)
          .aggregate(aggregationPipeline, options)
          .toArray();
        result[collection] = aggregationResult; // Store the result
      } else {
        let mongoQuery: Filter<Document> = {};

        // Handle $filter
        if ($filter) {
          mongoQuery = { ...mongoQuery, ...$filter };
        }

        // Handle $or
        if ($or) {
          mongoQuery.$or = $or;
        }

        // Handle parent relationship
        if (parentCollection && parentId) {
          const relationField =
            $by || `_p_${singular(parentCollection as string)}`;
          mongoQuery[relationField] = createPointer(
            parentCollection as string,
            parentId
          );
        }

        // Create a query
        let queryResult = this.#db.collection(collection).find(mongoQuery);

        // Apply sorting
        if ($sort) {
          queryResult = queryResult.sort($sort);
        }

        // Apply pagination
        queryResult = queryResult.skip($skip).limit($limit);

        // Execute and store the result
        result[collection] = await queryResult.toArray();
      }

      // Handle nested queries recursively
      // only if there's nested queries
      if (Object.entries(nestedQueries).length > 0) {
        for (const doc of result[collection]) {
          for (const [nestedCollection, nestedQuery] of Object.entries(
            nestedQueries
          )) {
            if (typeof nestedQuery === 'object' && nestedQuery !== null) {
              const nestedResult = await this.#executeQuery(
                { [nestedCollection]: nestedQuery } as any,
                collection,
                doc._id.toString()
              );
              doc[nestedCollection] = nestedResult[nestedCollection];
            }
          }
        }
      }

      // Handle inclusion
      await this.#parseInclusion({
        groupedResult: result,
        include: $include || [],
        cache,
      });
    }

    return result as {
      [K in keyof TQuery]: z.infer<
        CollectionSchema[K & keyof CollectionSchema]
      >[];
    };
  }

  async #parseInclusion({
    groupedResult,
    include,
    cache,
  }: {
    groupedResult: Record<string, any>;
    include: string[];
    cache: Map<string, any>;
  }) {
    for (const collection in groupedResult) {
      const result = groupedResult[collection];

      /**
       * create a tree structure out of include
       * to recursively join the pointers in the following format
       *
       * ie:
       * ['a', 'b', 'b.c', 'b.a', 'x.y.z']
       *
       * becomes:
       * {
       *    a: [],
       *    b: ['c', 'a'],
       *    x: ['y.z']
       * }
       *
       * then:
       * a, b, x becomes the pointer names (which should be mapped to the actual collection)
       * while their values are the new join paths to be requested
       */
      const tree = this.#parseTree(include ?? []);
      // console.log('tree', tree);
      /**
       * parse tree
       */
      for (const obj of result) {
        for (const pointerField in tree) {
          // console.log('pointerField', pointerField);
          // console.log('obj', obj);
          const pointerValue = obj[`_p_${pointerField}`] || obj[pointerField];
          //console.log('pointerValue', pointerValue);

          if (!pointerValue || !isPointer(pointerValue)) continue;

          if (isArrayPointer(pointerValue)) {
            for (let pointer of pointerValue) {
              const index = pointerValue.indexOf(pointer);
              const join = tree[pointerField];
              pointer = await this.#parseJoin({
                cache,
                join,
                pointerValue: pointerValue[index],
              });
              pointerValue[index] = pointer;
            }
            continue;
          }

          const join = tree[pointerField];
          // console.log('join', join);

          const doc = await this.#parseJoin({
            cache,
            join,
            pointerValue,
          });

          // replace pointer with the actual document
          obj[pointerField] = doc;

          // remove raw _p_ entry
          delete obj[`_p_${pointerField}`];
        }
      }
    }
  }

  async #parseJoin({
    cache,
    join,
    pointerValue,
  }: {
    cache: Map<string, any>;
    join: string[];
    pointerValue: any;
  }) {
    const collection = ejectPointerCollection(pointerValue);
    const objectId = ejectPointerId(pointerValue);

    const cacheKey = `${collection}-${objectId}`;

    if (cache.has(cacheKey)) {
      if (this.#inspect) {
        console.log('cache hit', cacheKey, cache.get(cacheKey));
      }
      return cache.get(cacheKey);
    }

    const result = await this.query({
      [collection]: {
        $include: join,
        $filter: {
          _id: objectId,
        },
      },
    } as any);

    cache.set(cacheKey, result[collection][0]);

    if (this.#inspect) {
      console.log('cache miss', cacheKey, result[collection][0]);
    }

    return result[collection][0];
  }

  #parseTree(arr: string[]) {
    return (
      arr.reduce((acc, item) => {
        const [key, ...rest] = item.split('.');
        const value = rest.join('.');
        if (acc[key]) {
          acc[key].push(value);
        } else {
          acc[key] = [value];
        }
        acc[key] = acc[key].filter((item) => item);
        return acc;
      }, {} as Record<string, string[]>) ?? {}
    );
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
}
