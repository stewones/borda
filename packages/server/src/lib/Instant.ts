/* eslint-disable @typescript-eslint/no-unused-vars */
import Elysia, {
  Static,
  StatusMap,
  t,
} from 'elysia';
import type { HTTPHeaders } from 'elysia/dist/types';
import { ElysiaWS } from 'elysia/dist/ws';
import type {
  AggregateOptions,
  Db,
  Document,
  Filter,
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
  createError,
  createPointer,
  ejectPointerCollection,
  ejectPointerId,
  InstaError,
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

import {
  compare,
  hash,
  newObjectId,
  newToken,
} from '../utils';

type SchemaType = Record<string, z.ZodType<any, any, any>>;

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

// @todo needs to replace typebox with zod and validate it internally
const SyncParamsSchema = <T extends string>(collections: readonly T[]) =>
  t.Object({
    collection: t.Union(collections.map((c) => t.Literal(c))),
  });

const CloudParamsSchema = <T extends string>(functions: readonly T[]) =>
  t.Object({
    function: t.Union(functions.map((f) => t.Literal(f))),
  });

const SyncMutationParamsSchema = <T extends string>(
  collections: readonly T[]
) =>
  t.Object({
    collection: t.Union(collections.map((c) => t.Literal(c))),
    id: t.String(),
  });

const SyncBatchQuery = {
  synced: t.Optional(t.Union([t.Null(), t.Date()])),
  activity: t.Union([t.Literal('recent'), t.Literal('oldest')]),
};

const SyncHeaders = {
  authorization: t.String({ pattern: '^Bearer ' }),
};

const SyncHeadersSchema = t.Object(SyncHeaders);

const SyncBatchQuerySchema = t.Object(SyncBatchQuery);

const SyncLiveQuery = {
  session: t.String(),
};

const SyncLiveQuerySchema = t.Object(SyncLiveQuery);

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
  }
> {
  #size = 1_000;
  #inspect = false;
  #connection = new Map<string, { clients: ElysiaWS<object, object>[] }>();
  #constraints: SyncConstraint[] = [];
  #schema!: CollectionSchema;
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
  #functions: string[] = [];
  #cloud: Record<string, (args: any) => Promise<any>> = {};
  #cloudSchema!: CloudSchema['body'];
  #cloudHeaders!: CloudSchema['headers'];
  #cloudResponse!: CloudSchema['response'];
  #cloudHooks?: Record<
    keyof CollectionSchema,
    Record<
      CloudHookAction,
      (data: {
        session?: string | undefined; // @todo session should be an object
        before?: CollectionSchema[keyof CollectionSchema] | undefined;
        doc: CollectionSchema[keyof CollectionSchema];
      }) => Promise<CollectionSchema[keyof CollectionSchema]>
    >
  >;

  static SyncBatchQuery = SyncBatchQuery;
  static SyncBatchQuerySchema = SyncBatchQuerySchema;
  static SyncLiveQuery = SyncLiveQuery;
  static SyncLiveQuerySchema = SyncLiveQuerySchema;
  static SyncHeaders = SyncHeaders;
  static SyncHeadersSchema = SyncHeadersSchema;
  static SyncParamsSchema = SyncParamsSchema;
  static SyncMutationParamsSchema = SyncMutationParamsSchema;

  static CloudParamsSchema = CloudParamsSchema;

  get db() {
    if (!this.#db) {
      throw new Error('MongoDB is not initialized');
    }
    return this.#db as Db & {
      addHook: <C extends keyof CollectionSchema>(
        action: DBHookAction,
        collection: C,
        fn: (data: {
          doc: CollectionSchema[keyof CollectionSchema];
        }) => Promise<void>
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
    return this.#functions;
  }

  constructor({
    size,
    inspect,
    constraints,
    schema,
    cloud,
    db,
    mongoURI,
  }: {
    size?: number | undefined;
    inspect?: boolean | undefined;
    constraints?: SyncConstraint[];
    schema: CollectionSchema;
    cloud?: CloudSchema;
    db?: Db;
    mongoURI?: string;
  }) {
    if (!schema) {
      throw new Error('a data schema is required');
    }

    if (cloud) {
      this.#cloudSchema = cloud.body;
      this.#cloudHeaders = cloud.headers;
      this.#cloudResponse = cloud.response;
      this.#functions = Object.keys(cloud.body);
    }

    if (db) {
      this.#db = db;
    }

    this.#schema = {
      users: InstaUserSchema,
      sessions: InstaSessionSchema,
      ...schema,
    };

    this.#size = size || this.#size;
    this.#inspect = inspect || this.#inspect;
    this.#constraints = constraints || [];
    this.#mongoURI = mongoURI || process.env['INSTA_MONGO_URI'] || '';

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

    for (const collection of this.#collections) {
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
      this.#pendingTasks = interval(1000)
        .pipe(
          tap(
            async () => await Promise.allSettled([this.#runPendingPointers()])
          )
        )
        .subscribe();

      if (this.#inspect) {
        console.log('🦊 Instant Server is ready');
      }
    } catch (error) {
      console.error('🚨 Instant Server failed to start', error);
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

  /**
   * collection sync handler
   */
  public collection = {
    get: () => {
      const ParamsSchema = Instant.SyncParamsSchema(this.#collections);

      return ({
        headers,
        params,
        query,
        set,
      }: {
        headers: Record<string, string | undefined>;
        params: typeof ParamsSchema;
        query: Static<typeof Instant.SyncBatchQuerySchema>;
        set: SetOptions;
      }) => this.#getData({ headers, params, query, set });
    },
    post: () => {
      const ParamsSchema = Instant.SyncParamsSchema(this.#collections);

      return ({
        headers,
        params,
        query,
        set,
        body,
      }: {
        headers: Record<string, string | undefined>;
        params: typeof ParamsSchema;
        query: Static<typeof Instant.SyncBatchQuerySchema>;
        set: SetOptions;
        body: Document;
      }) => this.#postData({ headers, params, query, set, body });
    },
    put: () => {
      const ParamsSchema = Instant.SyncMutationParamsSchema(this.#collections);
      return ({
        params,
        set,
        body,
        query,
        headers,
      }: {
        headers: Record<string, string | undefined>;
        params: typeof ParamsSchema;
        query: Static<typeof Instant.SyncBatchQuerySchema>;
        set: SetOptions;
        body: Document;
      }) => this.#putData({ params, set, body, query, headers });
    },
    delete: () => {
      const ParamsSchema = Instant.SyncMutationParamsSchema(this.#collections);

      return ({
        headers,
        params,
        query,
        set,
      }: {
        headers: Record<string, string | undefined>;
        params: typeof ParamsSchema;
        query: Static<typeof Instant.SyncBatchQuerySchema>;
        set: SetOptions;
      }) => this.#deleteData({ headers, params, query, set });
    },
  };

  /**
   * cloud functions handler
   */
  public cloud = {
    addFunction: <K extends keyof CloudSchema['body']>(
      name: K,
      fn: (args: {
        body: z.infer<CloudSchema['body'][K]>;
        headers: z.infer<CloudSchema['headers'][K]>;
        set: SetOptions;
      }) => Promise<z.infer<CloudSchema['response'][K]>>
    ) => {
      this.#functions.push(name as string);
      this.#cloud[name as string] = fn;
    },

    removeFunction: <K extends keyof CollectionSchema>(name: K) => {
      this.#functions = this.#functions.filter((fn) => fn !== name);
      delete this.#cloud[name as string];
    },

    addHook: <A extends CloudHookAction, C extends keyof CollectionSchema>(
      action: A,
      collection: C,
      fn: (data: {
        session?: string | undefined; // @todo
        before?: CollectionSchema[keyof CollectionSchema] | undefined;
        doc: CollectionSchema[keyof CollectionSchema];
      }) => A extends 'beforeSave'
        ? Promise<CollectionSchema[keyof CollectionSchema]>
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

    // function execution is only possible via elysia post
    // this is to ensure the function is properly validated and executed one way client -> server
    post: () => {
      return async ({
        headers,
        params,
        set,
        body,
      }: {
        headers: Record<string, string | undefined>;
        params: Record<string, string>;
        set: SetOptions;
        body: Document;
      }) => {
        try {
          const token = (headers['Authorization'] || 'Bearer ').split(' ')[1];
          const fn = this.#functions.find((fn) => fn === params['function']);

          if (!fn || !this.#cloud[fn]) {
            const { status, ...rest } = createError(
              404,
              'not_found',
              'Function not found',
              'The function you are trying to call does not exist',
              [],
              {
                fn: params['function'],
              }
            );
            set.status = status;
            return { ...rest, status, fn: params['function'] };
          }

          const fnSchema = this.#cloudSchema[fn];

          if (!fnSchema) {
            const { status, ...rest } = createError(
              400,
              'bad_request',
              'Function schema not found',
              'The function you are trying to call is not valid',
              [],
              {
                fn: params['function'],
              }
            );
            set.status = status;
            return { ...rest, status, fn: params['function'] };
          }

          // validate headers
          const headersSchema = this.#cloudHeaders[fn];
          if (headersSchema) {
            const validation = await this.validateHeaders(
              fn,
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
          if (!isPublic && !token) {
            const { status, ...rest } = createError(
              401,
              'unauthorized',
              'Unauthorized',
              'You are not authorized to call this function',
              [],
              {
                fn: params['function'],
              }
            );
            set.status = status;
            return { ...rest, status, fn: params['function'] };
          }

          if (!isPublic && token) {
            // @todo validate token against cache (5min) and db
            // grab a session and pass down to the function
          }

          // validate body
          let validation = await this.validateFunctionBody(fn, body, fnSchema);

          if (validation.type) {
            set.status = validation.status;
            return validation;
          }

          const result = await this.#cloud[fn]({
            headers,
            params,
            set,
            body,
            // session // @todo pass the session here
          });

          // validate response
          const responseSchema = this.#cloudResponse[fn];
          if (responseSchema) {
            validation = await this.validateFunctionResponse(
              fn,
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
            return { ...err, fn: params['function'] };
          }

          set.status = 500;
          return createError(
            500,
            'internal_server_error',
            'Function execution failed',
            'There was an error while executing this function. Please contact support.',
            [],
            {
              fn: params['function'],
            }
          );
        }
      };
    },
  };

  /**
   * live sync handler
   * @returns Elysia handler
   */
  public live = {
    query: Instant.SyncLiveQuerySchema,
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
  };

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
          createError(
            401,
            'unauthorized',
            'Unauthorized',
            'The email or password is incorrect'
          )
        );
      }

      const passwordMatch = await compare(password, user['_password']);

      if (!passwordMatch) {
        return Promise.reject(
          createError(
            401,
            'unauthorized',
            'Unauthorized',
            'The email or password is incorrect'
          )
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
          createError(
            400,
            'validation_error',
            'Email already exists',
            'The email provided already exists.'
          )
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
      await this.db.collection('sessions').deleteOne({ token });
      // @todo invalidate session cache
    },
    createSession: async ({ user }: { user: InstaUser }) => {
      /**
       * expires in 1 year
       * @todo make this an option ?
       */
      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);

      /**
       * generate a new session token
       */
      const now = new Date();
      const token = `i:${newToken()}`;

      const session = {
        _id: newObjectId(),
        _p_user: pointer('users', user._id),
        token: token,
        _expires_at: expiresAt,
        _created_at: now,
        _updated_at: now,
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

  public async validateQuery(query: unknown, schema: z.ZodType<any, any, any>) {
    try {
      await (schema as z.ZodObject<any>).parseAsync(query);
    } catch (zodError) {
      if (zodError instanceof z.ZodError) {
        return createError(
          400,
          'validation_error',
          'Invalid query',
          'The query provided is not valid.',
          zodError.errors.map((err) => ({
            path: err.path.join('.'),
            message: err.message,
          }))
        );
      }
      throw zodError;
    }

    return {} as InstaError;
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
        return createError(
          400,
          'validation_error',
          'Invalid data',
          `The data provided for ${collection} is not valid.`,
          zodError.errors.map((err) => ({
            path: err.path.join('.'),
            message: err.message,
          }))
        );
      }
      throw zodError; // Re-throw if it's not a ZodError
    }

    return {} as InstaError;
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
        return createError(
          400,
          'validation_error',
          'Invalid data provided',
          `The data provided for the ${name} function is not valid.`,
          zodError.errors.map((err) => ({
            path: err.path.join('.'),
            message: err.message,
          })),
          {
            fn: name,
          }
        );
      }
      throw zodError; // Re-throw if it's not a ZodError
    }

    return {} as InstaError;
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
        return createError(
          500,
          'bad_response',
          'Invalid response',
          `Server generated an invalid response for the ${name} function. Please contact support.`,
          zodError.errors.map((err) => ({
            path: err.path.join('.'),
            message: err.message,
          })),
          {
            fn: name,
          }
        );
      }
      throw zodError; // Re-throw if it's not a ZodError
    }

    return {} as InstaError;
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
        return createError(
          400,
          'bad_headers',
          'Invalid headers provided',
          `The headers provided for the ${name} function is not valid.`,
          zodError.errors.map((err) => ({
            path: err.path.join('.'),
            message: err.message,
          })),
          {
            fn: name,
          }
        );
      }
      throw zodError; // Re-throw if it's not a ZodError
    }

    return {} as InstaError;
  }

  private async validateRequest({
    collection,
    headers,
    body,
    strict = true,
    query,
  }: {
    query?: Static<typeof Instant.SyncBatchQuerySchema>;
    headers: Record<string, string | undefined>;
    body?: Document;
    collection: string;
    strict?: boolean;
  }) {
    // validate collection
    if (!this.collections.includes(collection)) {
      return createError(
        400,
        'bad_request',
        'collection not found',
        'the collection you are trying to retrieve was not found.'
      );
    }

    // validate headers - sync requires session at a minimum
    const headerSchema = z.object({
      authorization: z.string().regex(/^Bearer /),
    });

    let validation = await this.validateHeaders('sync', headers, headerSchema);

    if (validation.type && validation.errors) {
      return validation;
    }

    // validate query
    if (query) {
      const querySchema = z.object({
        synced: z.string().optional(),
        activity: z.enum(['recent', 'oldest']).optional(),
      });
      validation = await this.validateQuery(query, querySchema);
      if (validation.type && validation.errors) {
        return validation;
      }
    }

    // validate the body
    if (body) {
      validation = await this.validateBody(collection, body, { strict });
    }

    if (validation.type && validation.errors) {
      return validation;
    }

    return {} as InstaError;
  }

  async #createIndexes() {
    const collections = Object.keys(this.#schema);
    for (const collection of collections) {
      /**
       * Create `_expires_at` index used for soft deletes.
       * We don't actually delete a document right away, we update its _expires_at field with a `Date` so that clients can be aware of the delete.
       * Then mongo will automatically delete this document once the date is reached.
       * Another reasoning is due to hooks like `afterDelete` where we need the document to be available for linking it back to the consumer.
       */

      // check if index exists first
      const indexes = await this.db.collection(collection).indexes();
      const indexExists = indexes.find(
        (index) => index['name'] === '_expires_at_1'
      );
      if (indexExists) {
        continue;
      }

      const indexResult = await this.db
        .collection(collection)
        .createIndex({ _expires_at: 1 }, { expireAfterSeconds: 0 });

      console.log(`💽 Index created for collection ${collection}`, indexResult);
    }
  }

  async #getData({
    headers,
    params,
    query,
    set,
  }: {
    params: Record<string, string>;
    query: Static<typeof Instant.SyncBatchQuerySchema>;
    headers: Record<string, string | undefined>;
    set: SetOptions;
  }) {
    try {
      const { collection } = params;
      const { activity, synced } = query;

      const validation = await this.validateRequest({
        collection,
        headers,
        query,
      });

      if (validation.type && validation.errors) {
        set.status = 400;
        return validation;
      }

      const operator = activity === 'oldest' ? '$lt' : '$gt';
      const constraints = this.#constraints || [];

      // console.log(collection, query);

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
        return createError(
          400,
          'bad_request',
          'Params mismatch',
          'There is a mismatch between the params and constraints. Ensure that the params defined in the constraints are the same as the ones used in the sync method.'
        );
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
                  ...(synced
                    ? { _updated_at: { [operator]: new Date(synced) } }
                    : {}),
                  ...constraintsQuery,
                },
                {
                  ...(synced
                    ? { _updated_at: { [operator]: new Date(synced) } }
                    : {}),
                  ...(constraintsQueryWithoutCollectionId || constraintsQuery),
                  _id: collectionIdFieldWithoutPointers,
                },
              ],
            }
          : {
              ...(synced
                ? { _updated_at: { [operator]: new Date(synced) } }
                : {}),
              ...constraintsQuery,
            }),
      };

      const count = await this.db.collection(collection).countDocuments(filter);

      const data = await this.db
        .collection(collection)
        .find(filter)
        .sort({ _updated_at: activity === 'oldest' ? -1 : 1 })
        .limit(this.#size)
        .toArray();

      const nextSynced = data[data.length - 1]?.['_updated_at'].toISOString();

      return {
        collection,
        count,
        activity,
        synced: nextSynced || synced || new Date().toISOString(),
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

      return createError(
        500,
        'internal_server_error',
        'An error occurred while syncing',
        'We were not able to process your request. Please try again later or contact support.'
      );
    }
  }

  async #postData({
    params,
    set,
    body,
    headers,
    query,
  }: {
    params: Record<string, string>;
    query: Static<typeof Instant.SyncBatchQuerySchema>;
    headers: Record<string, string | undefined>;
    set: SetOptions;
    body: Document;
  }) {
    try {
      const { collection } = params;

      const validation = await this.validateRequest({
        collection,
        body,
        headers,
      });

      if (validation.type && validation.errors) {
        set.status = 400;
        return validation;
      }

      let data = omit(body, ['_id', '_created_at', '_updated_at']);
      const now = new Date();

      data['_id'] = newObjectId();

      // run cloud hooks
      if (this.#cloudHooks?.[collection]?.['beforeSave']) {
        data = await this.#cloudHooks?.[collection]?.['beforeSave']({
          before: undefined,
          doc: data as CollectionSchema[keyof CollectionSchema],
          session: undefined, // @todo add session
        });
      }

      // enforce _updated_at by the server
      data['_created_at'] = now;
      data['_updated_at'] = now;

      if (data['_sync']) {
        delete data['_sync'];
      }

      if (data['_expires_at']) {
        data['_expires_at'] = new Date(data['_expires_at']);
      }

      await this.db.collection(collection).insertOne(
        { ...data },
        {
          forceServerObjectId: false,
        }
      );

      // run cloud hooks
      if (this.#cloudHooks?.[collection]?.['afterSave']) {
        await this.#cloudHooks?.[collection]?.['afterSave']({
          before: undefined,
          doc: data as CollectionSchema[keyof CollectionSchema],
          session: undefined, // @todo add session
        });
      }

      return {
        _id: body['_id'], // which can also be an uuid generated locally. so we need to match it so that the client can mark as synced
        _updated_at: new Date().toISOString(),
      };
    } catch (error) {
      console.error('sync error', error);
      set.status = 500;

      return createError(
        500,
        'internal_server_error',
        'An error occurred while syncing',
        'We were not able to process your request. Please try again later or contact support.'
      );
    }
  }

  async #putData({
    params,
    set,
    body,
    query,
    headers,
  }: {
    params: Record<string, string>;
    set: SetOptions;
    body: Document;
    query: Static<typeof Instant.SyncBatchQuerySchema>;
    headers: Record<string, string | undefined>;
  }) {
    try {
      const { collection, id } = params;

      const validation = await this.validateRequest({
        collection,
        body,
        headers,
        strict: false,
      });

      if (validation.type && validation.errors) {
        set.status = 400;
        return validation;
      }

      let data = omit(body, ['_id', '_created_at', '_updated_at']);

      if (data['_sync']) {
        delete data['_sync'];
      }

      const doc = await this.db.collection(collection).findOne({
        $or: [{ _id: id as unknown as ObjectId }, { _uuid: id }],
      });

      // if doc doesn't exist and id is an uuid, create it
      if (isEmpty(doc) && id.includes('-')) {
        return this.#postData({
          params,
          set,
          body,
          query,
          headers,
        });
      }

      if (isEmpty(doc)) {
        set.status = 404;

        return createError(
          404,
          'not_found',
          'Document not found',
          'The document you are trying to update was not found.'
        );
      }

      // run cloud hooks
      if (this.#cloudHooks?.[collection]?.['beforeSave']) {
        data = await this.#cloudHooks?.[collection]?.['beforeSave']({
          before: doc as any,
          doc: { ...doc, ...data } as any,
          session: undefined, // @todo add session
        });
      }

      // enforce _updated_at by the server
      data['_updated_at'] = new Date();

      await this.db.collection(collection).updateOne(
        {
          $or: [{ _id: id as unknown as ObjectId }, { _uuid: id }],
        },
        { $set: data },
        { upsert: false }
      );

      // run cloud hooks
      if (this.#cloudHooks?.[collection]?.['afterSave']) {
        await this.#cloudHooks?.[collection]?.['afterSave']({
          before: doc as any,
          doc: { ...doc, ...data } as any,
          session: undefined, // @todo add session
        });
      }

      // cleanup value props with sync: false according to the schema
      const value = this.#cleanValue(collection, data);

      return {
        ...value,
        _updated_at: data['_updated_at'].toISOString(),
        _id: id,
      };
    } catch (error) {
      console.error('sync error', error);
      set.status = 500;

      return createError(
        500,
        'internal_server_error',
        'An error occurred while syncing',
        'We were not able to process your request. Please try again later or contact support.'
      );
    }
  }

  async #deleteData({
    params,
    set,
  }: {
    params: Record<string, string>;
    query: Static<typeof Instant.SyncBatchQuerySchema>;
    headers: Record<string, string | undefined>;
    set: SetOptions;
  }) {
    try {
      const { collection, id } = params;

      if (!this.collections.includes(collection)) {
        set.status = 400;

        return createError(
          400,
          'bad_request',
          'Collection not found',
          'The collection you are trying to delete is not found.'
        );
      }

      if (!id) {
        set.status = 400;

        return createError(
          400,
          'bad_request',
          'Document required',
          'The document id you are trying to delete is required.'
        );
      }

      const doc = await this.db.collection(collection).findOne({
        $or: [{ _id: id as unknown as ObjectId }, { _uuid: id }],
      });

      if (isEmpty(doc)) {
        set.status = 404;

        return createError(
          404,
          'not_found',
          'Document not found',
          'The document you are trying to delete was not found.'
        );
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
          session: undefined, // @todo add session
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
          session: undefined, // @todo add session
        });
      }

      return {
        _id: id,
        _updated_at: now.toISOString(),
      };
    } catch (error) {
      console.error('sync error', error);
      set.status = 500;

      return createError(
        500,
        'internal_server_error',
        'An error occurred while syncing',
        'We were not able to process your request. Please try again later or contact support.'
      );
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
        // Extract pointer fields from the schema
        const pointerFields = Object.entries(
          (this.#schema[collection] as z.ZodObject<any>).shape
        )
          .filter(
            ([key, value]) =>
              key.startsWith('_p_') && value instanceof z.ZodString
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

        // run beforeSave hooks
        if (this.#cloudHooks?.[collection]?.beforeSave) {
          doc = await this.#cloudHooks[collection].beforeSave({
            doc,
            before: undefined,
            session: undefined,
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
            session: undefined,
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
          return Promise.reject('Document not found');
        }

        let nextDoc: any = {
          ...value,
          _updated_at: new Date(),
        };

        // run beforeSave hooks
        if (this.#cloudHooks?.[collection]?.beforeSave) {
          nextDoc = await this.#cloudHooks[collection].beforeSave({
            doc: nextDoc,
            before: beforeDoc,
            session: undefined,
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
            session: undefined,
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
          return Promise.reject('Document not found');
        }

        // run beforeDelete hooks
        if (this.#cloudHooks?.[collection]?.beforeDelete) {
          await this.#cloudHooks[collection].beforeDelete({
            before: beforeDoc as any,
            doc: { ...beforeDoc, _expires_at: in1year } as any,
            session: undefined,
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
            session: undefined,
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
}
