/* eslint-disable @typescript-eslint/no-unused-vars */
import Elysia, {
  Static,
  StatusMap,
  t,
} from 'elysia';
import type { HTTPHeaders } from 'elysia/dist/types';
import { ElysiaWS } from 'elysia/dist/ws';
import type {
  Db,
  Document,
  Filter,
  Sort,
} from 'mongodb';
import {
  ChangeStreamDeleteDocument,
  ChangeStreamInsertDocument,
  ChangeStreamUpdateDocument,
} from 'mongodb';
import { singular } from 'pluralize';
import {
  interval,
  Subscription,
  tap,
} from 'rxjs';
import { z } from 'zod';

import {
  cleanKey,
  createPointer,
  ejectPointerCollection,
  ejectPointerId,
  isArrayPointer,
  isEmpty,
  isPointer,
  omit,
  pointer,
  SyncResponse,
  SyncResponseData,
  SyncStatus,
} from '@borda/client';
import { Borda } from '@borda/server';

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

export type iQLDirectives<TSchema> = {
  $limit?: number;
  $skip?: number;
  $sort?: Sort;
  $filter?:
    | {
        [K in keyof TSchema]?: Filter<TSchema>;
      }
    | ((item: TSchema) => boolean);
  $or?: Array<{ [K in keyof TSchema]?: Filter<TSchema> | TSchema }>;
  $by?: string;
  $include?: string[];
};

export interface SetOptions {
  headers: HTTPHeaders;
  status?: number | keyof StatusMap;
}

export interface SyncConstraint {
  key: string;
  collection: string;
}

const SyncParamsSchema = <T extends string>(collections: readonly T[]) =>
  t.Object({
    collection: t.Union(collections.map((c) => t.Literal(c))),
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

export class Instant<TSchema extends SchemaType> {
  #size = 1_000;
  #borda!: Borda; // @todo replace with a local db instance
  #inspect = false;
  #connection = new Map<string, { clients: ElysiaWS<object, object>[] }>();
  #constraints: SyncConstraint[] = [];
  #schema!: TSchema;
  #pendingTasks: Subscription | undefined;
  #pendingPointersBusy = false;
  #db!: Db;
  #collections: string[] = []; // collections to sync

  static SyncBatchQuery = SyncBatchQuery;
  static SyncBatchQuerySchema = SyncBatchQuerySchema;
  static SyncLiveQuery = SyncLiveQuery;
  static SyncLiveQuerySchema = SyncLiveQuerySchema;
  static SyncHeaders = SyncHeaders;
  static SyncHeadersSchema = SyncHeadersSchema;
  static SyncParamsSchema = SyncParamsSchema;
  static SyncMutationParamsSchema = SyncMutationParamsSchema;

  get db() {
    if (!this.#db) {
      throw new Error('MongoDB is not initialized');
    }
    return this.#db;
  }

  get collections() {
    return this.#collections;
  }

  constructor({
    size,
    inspect,
    constraints,
    schema,
    db,
  }: {
    size?: number | undefined;
    inspect?: boolean | undefined;
    constraints?: SyncConstraint[];
    schema: TSchema;
    db?: Db;
  }) {
    if (!schema) {
      throw new Error('a data schema is required');
    }

    if (db) {
      this.#db = db;
    }

    this.#schema = schema;
    this.#size = size || this.#size;
    this.#inspect = inspect || this.#inspect;
    this.#constraints = constraints || [];

    this.#collections = Object.keys(schema).filter((key) => {
      return (
        schema[key as keyof TSchema] &&
        (schema[key as keyof TSchema] as any)._sync
      );
    });
  }

  /**
   * attach borda instance
   * required in order to use the sync feature
   * @todo unify borda server in here with the same composition of the sync endpoints
   */
  attach(borda: Borda) {
    this.#borda = borda;
    return this;
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

  /**
   * listen to mongo change stream
   * and notify the clients about the changes
   */
  async ready() {
    try {
      const excludedFields = [
        '_id',
        '_created_at',
        '_updated_at',
        '_expires_at',
      ];

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
        const task = this.#borda.db.collection(collection);
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

            const broadcast: Record<
              'update' | 'insert' | 'delete',
              () => void
            > = {
              update: () => {
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

                const response: SyncResponseData = {
                  collection: collection,
                  status: 'updated',
                  value: fullDocument,
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
              },
              insert: () => {
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

                const response: SyncResponseData = {
                  collection: collection,
                  status: 'created',
                  value: fullDocument,
                };

                for (const identifier of identifiers) {
                  const { clients } = this.#connection.get(identifier) || {
                    clients: [],
                  };

                  for (const client of clients) {
                    client.send(JSON.stringify(response));
                  }
                }
              },
              delete: () => {
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
              },
            };

            broadcast[operationType]();
          }
        );
      }

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

      Promise.resolve();
    } catch (err) {
      console.error('Instant listener error', err);
      Promise.reject(err);
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

    rest
      .get(':collection', this.collection(), {
        query: Instant.SyncBatchQuerySchema,
        params: Instant.SyncParamsSchema(this.#collections),
        headers: Instant.SyncHeadersSchema,
        // @todo default logic to validate request before it's handled
        beforeHandle({ headers, params }) {
          // console.log('params', params);
          // console.log('headers', headers);
        },
      })
      .ws('live', {
        ...this.live(),
        query: Instant.SyncLiveQuerySchema,
        // @todo default logic to validate request before it's handled
        beforeHandle(ws) {
          // console.log('url', ws.url);
          // throw new Error('custom error');
        },
      });

    return rest;
  }

  public destroy() {
    this.#pendingPointersBusy = false;
    this.#pendingTasks?.unsubscribe();
    this.#connection.clear();
  }

  /**
   * collection sync handler
   * @returns Elysia handler
   */
  public collection() {
    return {
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
        const ParamsSchema = Instant.SyncMutationParamsSchema(
          this.#collections
        );
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
        const ParamsSchema = Instant.SyncMutationParamsSchema(
          this.#collections
        );

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
  }

  /**
   * live sync handler
   * @returns Elysia handler
   */
  public live() {
    return {
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
  }

  public validate(collection: string, data: unknown) {
    const schema = this.#schema[collection];

    try {
      // validate the body
      schema.parse(data);
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
        return {
          type: 'bad_request',
          message: 'params/constraints mismatch',
          summary:
            'call the sync method using the same `params` defined as `constraints` in the server setup.',
        };
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

      console.log('filter', collection, filter);

      const count = await this.#borda
        .query(collection)
        .sort({ _updated_at: activity === 'oldest' ? -1 : 1 })
        .filter(filter)
        .count();

      const data = await this.#borda
        .query(collection)
        .sort({
          _updated_at: activity === 'oldest' ? -1 : 1,
        })
        .filter(filter)
        .limit(this.#size)
        .find({
          parse: {
            doc: false,
          },
        });

      const nextSynced = data[data.length - 1]?.['_updated_at'].toISOString();

      return {
        collection,
        count,
        activity,
        synced: nextSynced || synced || new Date().toISOString(),
        data: data.map((entry) => {
          const value = entry;

          const expiresAt = entry['_expires_at']?.toISOString();
          const updatedAt = entry['_updated_at'].toISOString();
          const createdAt = entry['_created_at'].toISOString();

          const status: SyncStatus = expiresAt
            ? 'deleted'
            : updatedAt !== createdAt
            ? 'updated'
            : 'created';

          return {
            status,
            value,
          };
        }),
      } as SyncResponse;
    } catch (error) {
      console.error('sync error', error);
      set.status = 500;
      return {
        type: 'internal_server_error',
        message: 'an error occurred while syncing',
        summary:
          'we were not able to process your request. please try again later.',
      };
    }
  }

  async #postData({
    params,
    set,
    body,
  }: {
    params: Record<string, string>;
    query: Static<typeof Instant.SyncBatchQuerySchema>;
    headers: Record<string, string | undefined>;
    set: SetOptions;
    body: Document;
  }) {
    try {
      const { collection } = params;

      const data = omit(body, ['_id', '_created_at', '_updated_at']);

      if (data['_sync']) {
        delete data['_sync'];
      }

      if (data['_expires_at']) {
        data['_expires_at'] = new Date(data['_expires_at']);
      }

      await this.#borda.query(collection).insert({ ...data });

      return {
        _id: body['_id'], // which can also be an uuid generated locally. so we need to match it so that the client can mark as synced
        _updated_at: new Date().toISOString(),
      };
    } catch (error) {
      console.error('sync error', error);
      set.status = 500;
      return {
        type: 'internal_server_error',
        message: 'an error occurred while syncing',
        summary:
          'we were not able to process your request. please try again later.',
      };
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
      const data = omit(body, ['_id', '_created_at', '_updated_at']);

      if (data['_sync']) {
        delete data['_sync'];
      }

      const doc = await this.#borda
        .query(collection)
        .filter({
          $or: [
            {
              _id: id,
            },
            {
              _uuid: id,
            },
          ],
        })
        .findOne();

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

      await this.#borda
        .query(collection)
        .filter({
          $or: [
            {
              _id: id,
            },
            {
              _uuid: id,
            },
          ],
        })
        .update(data);

      const now = new Date();

      return {
        ...data,
        _updated_at: now.toISOString(),
      };
    } catch (error) {
      console.error('sync error', error);
      set.status = 500;
      return {
        type: 'internal_server_error',
        message: 'an error occurred while syncing',
        summary:
          'we were not able to process your request. please try again later.',
      };
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
      const now = new Date();
      const in1year = new Date(
        new Date().setFullYear(new Date().getFullYear() + 1)
      );
      await this.#borda
        .query(collection)
        .filter({
          $or: [
            {
              _id: id,
            },
            {
              _uuid: id,
            },
          ],
        })
        .delete({
          expiresAt: in1year,
        });

      return {
        _id: id,
        _updated_at: now.toISOString(),
      };
    } catch (error) {
      console.error('sync error', error);
      set.status = 500;
      return {
        type: 'internal_server_error',
        message: 'an error occurred while syncing',
        summary:
          'we were not able to process your request. please try again later.',
      };
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
          const query = this.#borda.db.collection(collection).find({
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
              const pointerData = await this.#borda.db
                .collection(pointerCollection)
                .findOne({
                  _uuid: pointerUuid,
                });
              const pointerId = pointerData?._id.toString() || '';

              if (pointerId && pointerData && !pointerId.includes('-')) {
                // update the item in the database
                await this.#borda.db.collection(collection).updateOne(
                  {
                    _id: item._id,
                  },
                  {
                    $set: {
                      [key]: createPointer(pointerCollection, pointerId),
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
  public async query<Q extends iQL<TSchema>>(
    iql: Q
  ): Promise<{
    [K in keyof Q]: z.infer<TSchema[K & keyof TSchema]>[];
  }> {
    return this.#executeQuery(iql);
  }

  async #executeQuery<TQuery extends iQL<TSchema>>(
    iql: TQuery,
    parentCollection?: keyof TSchema,
    parentId?: string
  ): Promise<{
    [K in keyof TQuery]: z.infer<TSchema[K & keyof TSchema]>[];
  }> {
    let result: any = {};
    let key = '';
    const cache: Map<string, any> = new Map();

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
        ...nestedQueries
      } = query as iQLDirectives<any> & Record<string, any>;

      let mongoQuery: Filter<Document> = {};

      // Handle $filter
      if ($filter) {
        if (typeof $filter === 'function') {
          // Client-side filtering, not applicable for server-side
          console.warn(
            'Function-based filtering is not supported on the server'
          );
        } else {
          mongoQuery = { ...mongoQuery, ...$filter };
        }
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

        // Create a unique cache key
        // it should be the last step to account for all possible query variations
        key = cleanKey({
          collection,
          [relationField]: mongoQuery[relationField],
          query,
        });
      }

      if (key && cache.has(key)) {
        result[collection] = cache.get(key);
        if (this.#inspect) {
          console.log('cache hit', key, result[collection]);
        }
      } else {
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

        // Cache the result locally
        if (key) {
          cache.set(key, [...result[collection]]);
          if (this.#inspect) {
            console.log('cache miss', key, result[collection]);
          }
        }
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
      [K in keyof TQuery]: z.infer<TSchema[K & keyof TSchema]>[];
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

          /**
           * reaching here means the object may be populated in the first level
           * but we still need to keep trying to populate the next level
           */
          // for (const pointerTreeField of join) {
          //   const pointerTreeBase = pointerTreeField.split('.')[0];

          //   await this.#parseInclusion({
          //     groupedResult: {
          //       [pointerTreeBase]: obj[pointerTreeBase],
          //     },
          //     include: [pointerTreeField],
          //   });
          // }
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
