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
} from '@borda/client';
import { Borda } from '@borda/server';

export interface SetOptions {
  headers: HTTPHeaders;
  status?: number | keyof StatusMap;
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
  #pointers: string[] = [];

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
    pointers,
  }: {
    size?: number | undefined;
    inspect?: boolean | undefined;
    collections: T[];
    pointers?: string[];
  }) {
    this.#size = size || this.#size;
    this.#inspect = inspect || this.#inspect;
    this.#pointers = pointers || [];
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

  /**
   * listen to mongo change stream
   * and notify the clients about the changes
   */
  async ready() {
    try {
      const excludedKeys = ['_id', '_created_at', '_updated_at', '_expires_at'];

      const docQueryParams = (doc: Document) => {
        return Object.entries(doc)
          .filter(
            ([key, value]) =>
              typeof value === 'string' && !excludedKeys.includes(key)
          )
          .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
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
                  pointers: this.#pointers,
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
                  pointers: this.#pointers,
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
                  pointers: this.#pointers,
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

  #buildIdentifier({
    query,
    pointers,
  }: {
    query: Record<string, string>;
    pointers: string[];
  }) {
    // build identifier based on query
    let identifier = '';

    for (const pointer of pointers) {
      if (query[pointer]) {
        identifier += `@${pointer}:${query[pointer]}`;
      }
    }

    if (!identifier) {
      console.warn(
        '🚨 no pointers found in your config. the sync will be broadcast to everyone.'
      );
      identifier = 'broadcast';
    }

    return identifier;
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
    }: {
      headers: Record<string, string | undefined>;
      params: typeof ParamsSchema;
      query: Static<typeof Instant.SyncQuerySchema>;
    }) => this.sync({ headers, params, query });
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
        const pointers = this.#pointers || [];

        const identifier = this.#buildIdentifier({ query, pointers });

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
        const pointers = this.#pointers || [];

        const identifier = this.#buildIdentifier({ query, pointers });

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
  }: {
    params: Record<string, string>;
    query: Static<typeof Instant.SyncQuerySchema>;
    headers: Record<string, string | undefined>;
  }) {
    const { collection } = params;
    const { activity, synced } = query;

    const operator = activity === 'oldest' ? '$lt' : '$gt';

    const count = await this.#borda
      .query(collection)
      .sort({ _updated_at: activity === 'oldest' ? -1 : 1 })
      .filter({
        _updated_at: { [operator]: new Date(synced || new Date()) },
      })
      .count();

    const data = await this.#borda
      .query(collection)
      .sort({
        _updated_at: activity === 'oldest' ? -1 : 1,
      })
      .filter(synced ? { _updated_at: { [operator]: new Date(synced) } } : {})
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
