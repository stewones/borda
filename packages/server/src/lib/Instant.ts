/* eslint-disable @typescript-eslint/no-unused-vars */
import Elysia, { Static, StatusMap, t } from 'elysia';
import type { HTTPHeaders } from 'elysia/dist/types';
import { ElysiaWS } from 'elysia/dist/ws';
import type { Document } from 'mongodb';
import {
  ChangeStreamDeleteDocument,
  ChangeStreamInsertDocument,
  ChangeStreamUpdateDocument,
} from 'mongodb';

import {
  InstantSyncResponse,
  InstantSyncResponseData,
  InstantSyncStatus,
  isDate,
  pointer,
} from '@borda/client';
import { Borda } from '@borda/server';

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

const SyncQuery = {
  synced: t.Optional(t.Union([t.Null(), t.Date()])),
  activity: t.Union([t.Literal('recent'), t.Literal('oldest')]),
};

const SyncHeaders = {
  authorization: t.String({ pattern: '^Bearer ' }),
};

const SyncHeadersSchema = t.Object(SyncHeaders);

const SyncQuerySchema = t.Object(SyncQuery);

const SyncLiveQuery = {
  session: t.String(),
};

const SyncLiveQuerySchema = t.Object(SyncLiveQuery);

export class Instant<T extends string> {
  #size = 1_000;
  #borda!: Borda;
  #inspect = false;
  #connection = new Map<string, { clients: ElysiaWS<object, object>[] }>();
  #constraints: SyncConstraint[] = [];

  static SyncQuery = SyncQuery;
  static SyncQuerySchema = SyncQuerySchema;
  static SyncLiveQuery = SyncLiveQuery;
  static SyncLiveQuerySchema = SyncLiveQuerySchema;
  static SyncHeaders = SyncHeaders;
  static SyncHeadersSchema = SyncHeadersSchema;
  static SyncParamsSchema = SyncParamsSchema;

  collections: T[] = [];

  constructor({
    size,
    inspect,
    collections,
    constraints,
  }: {
    size?: number | undefined;
    inspect?: boolean | undefined;
    collections: T[];
    constraints?: SyncConstraint[];
  }) {
    this.#size = size || this.#size;
    this.#inspect = inspect || this.#inspect;
    this.#constraints = constraints || [];
    this.collections = collections;
  }

  /**
   * attach borda instance
   * required in order to use the sync feature
   */
  attach(borda: Borda) {
    this.#borda = borda;
    return this;
  }

  #buildIdentifier({
    query,
    constraints,
  }: {
    query: Record<string, string>;
    constraints: SyncConstraint[];
  }) {
    // build identifier based on query
    let identifier = '';

    for (const c of constraints) {
      if (query[c.key]) {
        identifier += `@${c.key}:${query[c.key]}`;
      }
    }

    if (!identifier) {
      console.warn(
        '🚨 no constraints found. the sync will be broadcast to everyone with no filters.'
      );
      identifier = 'broadcast';
    }

    return identifier;
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

      for (const collection of this.collections) {
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

                if (
                  fullDocument['_expires_at'] &&
                  isDate(fullDocument['_expires_at'])
                ) {
                  return broadcast.delete();
                }

                const { updatedFields, removedFields, truncatedArrays } =
                  updateDescription ?? {};

                const fullDocumentAsQueryParams = docQueryParams(
                  fullDocument || {}
                );

                const identifier = this.#buildIdentifier({
                  query: fullDocumentAsQueryParams,
                  constraints: this.#constraints,
                });

                const response: InstantSyncResponseData = {
                  collection: collection,
                  status: 'updated',
                  value: fullDocument,
                  updatedFields,
                  removedFields,
                  truncatedArrays,
                };

                const { clients } = this.#connection.get(identifier) || {
                  clients: [],
                };

                for (const client of clients) {
                  client.send(JSON.stringify(response));
                }
              },
              insert: () => {
                const { fullDocument } = change as ChangeStreamInsertDocument;
                if (!fullDocument) {
                  return;
                }

                const fullDocumentAsQueryParams = docQueryParams(
                  fullDocument || {}
                );

                const identifier = this.#buildIdentifier({
                  query: fullDocumentAsQueryParams,
                  constraints: this.#constraints,
                });

                const response: InstantSyncResponseData = {
                  collection: collection,
                  status: 'created',
                  value: fullDocument,
                };

                const { clients } = this.#connection.get(identifier) || {
                  clients: [],
                };

                for (const client of clients) {
                  client.send(JSON.stringify(response));
                }
              },
              delete: () => {
                const { fullDocumentBeforeChange } =
                  change as ChangeStreamDeleteDocument;

                if (!fullDocumentBeforeChange) {
                  return;
                }

                const fullDocumentAsQueryParams = docQueryParams(
                  fullDocumentBeforeChange || {}
                );

                const identifier = this.#buildIdentifier({
                  query: fullDocumentAsQueryParams,
                  constraints: this.#constraints,
                });

                const response: InstantSyncResponseData = {
                  collection: collection,
                  status: 'deleted',
                  value: fullDocumentBeforeChange,
                };

                const { clients } = this.#connection.get(identifier) || {
                  clients: [],
                };

                for (const client of clients) {
                  client.send(JSON.stringify(response));
                }
              },
            };

            broadcast[operationType]();
          }
        );
      }

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
        query: Instant.SyncQuerySchema,
        params: Instant.SyncParamsSchema(this.collections),
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

  /**
   * collection sync handler
   * @returns Elysia handler
   */
  public collection() {
    const ParamsSchema = Instant.SyncParamsSchema(this.collections);

    return ({
      headers,
      params,
      query,
      set,
    }: {
      headers: Record<string, string | undefined>;
      params: typeof ParamsSchema;
      query: Static<typeof Instant.SyncQuerySchema>;
      set: SetOptions;
    }) => this.sync({ headers, params, query, set });
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

        const identifier = this.#buildIdentifier({ query, constraints });

        this.#connection.set(identifier, {
          clients: [...(this.#connection.get(identifier)?.clients || []), ws],
        });

        if (this.#inspect) {
          console.log('sync open connection:', id, identifier);
          console.log('sync open connection size:', this.#connection.size);
          console.log(
            'sync open connection clients:',
            this.#connection.get(identifier)?.clients.length
          );
        }
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      close: (ws: ElysiaWS<any, any, any>) => {
        const id = ws.id;
        const query = ws.data['query'];
        const constraints = this.#constraints || [];

        const identifier = this.#buildIdentifier({ query, constraints });

        const connection = this.#connection.get(identifier);
        if (connection) {
          connection.clients = connection.clients.filter(
            (client) => client.id !== id
          );
          if (connection.clients.length === 0) {
            this.#connection.delete(identifier);
          }
        }

        if (this.#inspect) {
          console.log('sync closed connection:', id, identifier);
          console.log('sync open connection size:', this.#connection.size);
          console.log(
            'sync open connection clients:',
            this.#connection.get(identifier)?.clients.length
          );
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

  /**
   * sync handler
   * @returns sync response
   */
  async sync({
    headers,
    params,
    query,
    set,
  }: {
    params: Record<string, string>;
    query: Static<typeof Instant.SyncQuerySchema>;
    headers: Record<string, string | undefined>;
    set: SetOptions;
  }) {
    const { collection } = params;
    const { activity, synced } = query;

    const operator = activity === 'oldest' ? '$lt' : '$gt';

    const constraints = this.#constraints || [];

    // determine the constraint key and value to be used in the mongo query
    // based on the query params. it can be multiple constraints
    // eg: ?synced=2024-01-01&activity=recent&org=orgId&user=userId
    // where the constraints are `org` and `user`
    const constraintsQuery = constraints.reduce((acc, constraint) => {
      const value = query[constraint.key as keyof typeof query];
      if (value !== undefined && value !== null) {
        const pKey = !constraint.key.startsWith('_p_')
          ? `_p_${constraint.key}`
          : constraint.key;

        acc[pKey] = pointer(constraint.collection, String(value));
      }
      return acc;
    }, {} as Record<string, string>);

    // throw if the constraints defined don't match the query
    if (Object.keys(constraintsQuery).length !== constraints.length) {
      set.status = 400;
      return {
        type: 'bad_request',
        message: 'params/constraints mismatch',
        summary:
          'you should call the sync method using the same `params` defined as `constraints` in the server.',
      };
    }

    const count = await this.#borda
      .query(collection)
      .sort({ _updated_at: activity === 'oldest' ? -1 : 1 })
      .filter({
        _updated_at: { [operator]: new Date(synced || new Date()) },
        ...constraintsQuery,
      })
      .count();

    const data = await this.#borda
      .query(collection)
      .sort({
        _updated_at: activity === 'oldest' ? -1 : 1,
      })
      .filter({
        ...(synced ? { _updated_at: { [operator]: new Date(synced) } } : {}),
        ...constraintsQuery,
      })
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

        const status: InstantSyncStatus = expiresAt
          ? 'deleted'
          : updatedAt !== createdAt
          ? 'updated'
          : 'created';

        return {
          status,
          value,
        };
      }),
    } as InstantSyncResponse;
  }
}
