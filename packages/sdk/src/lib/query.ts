/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */

import 'reflect-metadata';

import {
  finalize,
  Observable,
} from 'rxjs';

import { EleganteClient } from './Client';
import {
  EleganteError,
  ErrorCode,
} from './Error';
import {
  fetch,
  HttpMethod,
} from './fetch';
import {
  InternalFieldName,
  InternalHeaders,
} from './internal';
import { log } from './log';
import {
  DocumentLiveQuery,
  LiveQueryMessage,
} from './types';
import {
  ChangeStreamOptions,
  Document,
  DocumentQuery,
  DocumentResponse,
  ManyInsertResponse,
  ManyUpdateResponse,
  Query,
} from './types/query';
import {
  cleanKey,
  isBoolean,
  isEmpty,
  isServer,
  LocalStorage,
} from './utils';
import {
  getUrl,
  WebSocketFactory,
  webSocketServer,
} from './websocket';

export function query<TSchema extends Document = Document>(collection: string) {
  const bridge: Query<TSchema> = {
    params: {
      collection: '',
      filter: {},
      include: [],
      exclude: [],
      unlock: false,
    },

    options: {},

    unlock: (isUnlocked?: boolean) => {
      if (!isBoolean(isUnlocked)) {
        isUnlocked = true;
      }

      /**
       * unlock can only be used in server environment
       * with proper ApiKey+ApiSecret defined
       */
      if (!isServer() && isUnlocked) {
        throw new EleganteError(
          ErrorCode.SERVER_UNLOCK_ONLY,
          `unlock can only be used in server environment`
        );
      }

      bridge.params['unlock'] = isUnlocked;
      return bridge;
    },

    /**
     * doc modifiers
     */
    projection: (project) => {
      const newProject = {
        ...project,
      } as any;

      /**
       * deal with internal field names
       */
      const keys = Object.keys(newProject);
      for (const key in InternalFieldName) {
        if (keys.includes(key)) {
          newProject[InternalFieldName[key]] = newProject[key];
        }
      }

      bridge.params['projection'] = newProject;
      return bridge;
    },

    sort: (by) => {
      bridge.params['sort'] = by;
      return bridge;
    },

    filter: (by) => {
      bridge.params['filter'] = by as any;
      return bridge;
    },

    limit: (by) => {
      bridge.params['limit'] = by;
      return bridge;
    },

    skip: (by) => {
      bridge.params['skip'] = by;
      return bridge;
    },

    include: (fields) => {
      bridge.params['include'] = fields;
      return bridge;
    },

    exclude: (fields) => {
      bridge.params['exclude'] = fields;
      return bridge;
    },

    pipeline: (docs) => {
      bridge.params['pipeline'] = docs ? docs : ([] as any);
      return bridge;
    },

    /**
     * doc methods
     */
    find: (options) => {
      return bridge.run('find', options) as Promise<TSchema[]>;
    },

    findOne: (optionsOrObjectId, options?) => {
      const hasDocModifier =
        !isEmpty(bridge.params['projection']) ||
        !isEmpty(bridge.params['include']) ||
        !isEmpty(bridge.params['filter']) ||
        !isEmpty(bridge.params['pipeline']);

      /**
       * in case we have objectId and modifiers
       * we need to run as findOne to make include and others work
       */
      if (typeof optionsOrObjectId === 'string' && hasDocModifier) {
        bridge['params']['filter'] = {
          _id: {
            $eq: optionsOrObjectId,
          },
        } as any;
      }

      return bridge.run(
        typeof optionsOrObjectId === 'string' && !hasDocModifier
          ? 'get'
          : 'findOne',
        typeof optionsOrObjectId === 'string'
          ? options ?? {}
          : optionsOrObjectId,
        {},
        typeof optionsOrObjectId === 'string' ? optionsOrObjectId : undefined
      ) as Promise<TSchema>;
    },

    update: (objectIdOrDoc, docOrOptions?: Partial<TSchema>, options?) => {
      return bridge.run(
        // method
        typeof objectIdOrDoc === 'string' ? 'put' : 'update',
        // options
        docOrOptions && docOrOptions['context'] ? docOrOptions : options ?? {},
        // optional: doc
        docOrOptions && !docOrOptions['context'] ? docOrOptions : {},
        // optional: objectId
        typeof objectIdOrDoc === 'string' ? objectIdOrDoc : undefined
      ) as Promise<void>;
    },

    updateMany: (doc, options?) => {
      return bridge.run(
        'updateMany',
        options ?? {},
        doc ?? {}
      ) as Promise<ManyUpdateResponse>;
    },

    insert: (doc, options?) => {
      return bridge.run('insert', options ?? {}, doc) as Promise<TSchema>;
    },

    insertMany: (docs, options?) => {
      return bridge.run('insertMany', options ?? {}, docs ?? []) as Promise<
        ManyInsertResponse<TSchema>
      >;
    },

    delete: (objectIdOrOptions?, options?) => {
      return bridge.run(
        // method
        typeof objectIdOrOptions === 'string' ? 'delete' : 'remove',
        // options
        typeof objectIdOrOptions === 'object' && objectIdOrOptions['context']
          ? objectIdOrOptions
          : options ?? {},
        // doc
        {},
        // objectId
        typeof objectIdOrOptions === 'string' ? objectIdOrOptions : undefined
      ) as Promise<void>;
    },

    deleteMany: (options) => {
      return bridge.run('removeMany', options) as Promise<ManyUpdateResponse>;
    },

    count: (options) => {
      return bridge.run('count', options) as Promise<number>;
    },

    aggregate: (options) => {
      return bridge.run('aggregate', options) as Promise<TSchema[]>;
    },

    /**
     * doc retrieval
     */
    run: (method, options, docOrDocs?, objectId?) => {
      let doc: Document = {};
      let docs: Document[] = [];
      if (docOrDocs && Array.isArray(docOrDocs)) {
        docs = docOrDocs as Document[];
      }

      if (docOrDocs && !Array.isArray(docOrDocs)) {
        doc = docOrDocs as Document;
      }

      options = {
        ...bridge.options,
        ...options,
      };

      if (!EleganteClient.params.serverURL) {
        throw new EleganteError(
          ErrorCode.SERVER_URL_UNDEFINED,
          'serverURL is not defined on client'
        );
      }

      if (!bridge.params['collection']) {
        throw new EleganteError(
          ErrorCode.COLLECTION_REQUIRED,
          'a collection name is required'
        );
      }

      if (['update', 'remove'].includes(method)) {
        if (isEmpty(bridge.params['filter'])) {
          throw new EleganteError(
            ErrorCode.FILTER_REQUIRED_FOR_DOC_MUTATION,
            'a filter is required for doc mutation. ie: update and delete'
          );
        }
      }

      if (!isEmpty(bridge.params['pipeline']) && method !== 'aggregate') {
        throw new EleganteError(
          ErrorCode.PIPELINE_ONLY_FOR_AGGREGATE,
          `pipeline can only be used for aggregate. you're trying to use "${method}()"`
        );
      }

      const {
        filter,
        limit,
        skip,
        sort,
        projection,
        include,
        exclude,
        pipeline,
        unlock,
      } = bridge.params;

      const { inspect } = options;
      const headers = {
        [`${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiKey']}`]:
          EleganteClient.params.apiKey,
        [`${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiMethod']}`]:
          method,
      };

      if (inspect) {
        headers[
          `${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiInspect']}`
        ] = 'true';
      }

      if (unlock) {
        headers[
          `${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiSecret']}`
        ] = EleganteClient.params.apiSecret ?? '👀';
      }

      if (!isServer()) {
        const token = LocalStorage.get(
          `${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiToken']}`
        );

        if (token) {
          headers[
            `${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiToken']}`
          ] = token;
        }
      }

      log(method, 'params', JSON.stringify(bridge.params));
      log(method, 'options', JSON.stringify(options));
      if (!isEmpty(doc)) {
        log(method, 'doc', JSON.stringify(doc));
      }
      if (!isEmpty(docs)) {
        log(method, 'docs', docs.length, docs[0]);
      }

      const docQuery: Document | DocumentQuery<TSchema> = {
        options,
        filter,
        projection,
        sort,
        limit,
        skip,
        include,
        exclude,
        pipeline,
        doc,
        docs,
      };

      const promise = fetch<DocumentResponse<TSchema>>(
        `${EleganteClient.params.serverURL}/${bridge.params['collection']}${
          ['get', 'put', 'delete'].includes(method) ? '/' + objectId : ''
        }`,
        {
          headers,
          body: method === 'get' ? null : docQuery,
          method: ['get', 'put', 'delete'].includes(method)
            ? (method.toUpperCase() as HttpMethod)
            : 'POST',
        }
      );

      Reflect.defineMetadata(
        'key',
        cleanKey({ collection: bridge.params['collection'], ...docQuery }),
        promise
      );

      return promise;
    },

    on: (event, options?: ChangeStreamOptions) => {
      let wss: WebSocket;
      let wssFinished = false;
      let wssConnected = false;

      const {
        filter,
        limit,
        skip,
        sort,
        projection,
        include,
        exclude,
        pipeline,
        unlock,
        collection,
      } = bridge.params;

      const body: DocumentLiveQuery = {
        options,
        projection,
        sort,
        limit,
        skip,
        include,
        exclude,
        collection,
        event,
        filter: filter ?? ({} as any),
        pipeline: pipeline ?? ([] as any),
        unlock: unlock ?? false,
        method: 'on',
      };

      const observable = new Observable<LiveQueryMessage<TSchema>>(
        (observer) => {
          if (!EleganteClient.params.serverURL) {
            throw new EleganteError(
              ErrorCode.SERVER_URL_UNDEFINED,
              'serverURL is not defined on client'
            );
          }

          const socketURLPathname = `/${bridge.params['collection']}`;
          const socketURL = getUrl() + socketURLPathname;

          const webSocket: WebSocketFactory = {
            onOpen: (ws, ev) => {
              wss = ws;
              wssConnected = true;
              log('on', event, bridge.params['collection'], bridge.params);
            },

            onError: (ws, err) => {
              log('error', 'on', event, err, bridge.params['collection']);
            },

            onConnect: (ws) => {
              // send query to the server
              ws.send(JSON.stringify(body));
            },

            onMessage: (ws, message) => {
              const data = message.data;
              try {
                observer.next(JSON.parse(data));
              } catch (err) {
                log('on', event, bridge.params['collection'], 'error', err);
                ws.close();
              }
            },

            onClose: (ws, ev) => {
              if (wssFinished || ev?.code === 1008) {
                wss.close();
                observer.error(
                  new EleganteError(
                    ErrorCode.LIVE_QUERY_SOCKET_CLOSE,
                    ev.reason || ''
                  )
                );
                return;
              }
              if (wssConnected) {
                wssConnected = false;
                log(
                  'on',
                  event,
                  bridge.params['collection'],
                  'disconnected',
                  ev.reason,
                  bridge.params
                );
              }
              setTimeout(() => {
                log(
                  'on',
                  event,
                  bridge.params['collection'],
                  'trying to reconnect',
                  bridge.params
                );
                webSocketServer(socketURL)(webSocket);
              }, 1 * 500);
            },
          };

          /**
           * connect to the server
           */
          webSocketServer(socketURL)(webSocket);
        }
      ).pipe(
        finalize(() => {
          log('on', event, 'unsubscribed', bridge.params);
          wssFinished = true;
          wss.close();
        })
      );

      Reflect.defineMetadata('key', cleanKey(body), observable);
      return observable;
    },

    once: () => {
      let wss: WebSocket;

      return new Observable<LiveQueryMessage<TSchema>>((observer) => {
        if (!EleganteClient.params.serverURL) {
          throw new EleganteError(
            ErrorCode.SERVER_URL_UNDEFINED,
            'serverURL is not defined on client'
          );
        }
        const socketURLPathname = `/${bridge.params['collection']}`;
        const socketURL = getUrl() + socketURLPathname;

        webSocketServer(socketURL)({
          onOpen: (ws, ev) => {
            wss = ws;
            log('once', bridge.params['collection'], bridge.params);
          },

          onError: (ws, err) => {
            log('error', 'once', bridge.params['collection'], err);
            observer.error(err);
            ws.close();
          },

          onConnect: (ws) => {
            const {
              filter,
              limit,
              skip,
              sort,
              projection,
              include,
              exclude,
              pipeline,
              unlock,
              collection,
            } = bridge.params;

            const body: DocumentLiveQuery = {
              projection,
              sort,
              limit,
              skip,
              include,
              exclude,
              pipeline,
              collection,
              filter: filter ?? ({} as any),
              unlock: unlock ?? false,
              method: 'once',
            };

            // send query to the server
            ws.send(JSON.stringify(body));
          },

          onMessage: (ws, message) => {
            ws.close(); // this is a one time query
            const data = message.data ?? '';

            try {
              observer.next(JSON.parse(data));
              observer.complete(); // this is a one time query
            } catch (err) {
              log('once', bridge.params['collection'], err);
              observer.error(err);
            }
          },

          onClose: (ws, ev) => {
            // since it's a one-time query, we don't need to reconnect
            observer.complete();
          },
        });
      }).pipe(
        finalize(() => {
          log(
            'once',
            bridge.params['collection'],
            'unsubscribed',
            bridge.params
          );
          wss.close();
        })
      );
    },
  };

  // ensure collection name doesn't ends with "s" because
  // it's already means plural and for good architecture practices
  // we should keep it as singular
  if (collection.endsWith('s')) {
    throw new EleganteError(
      ErrorCode.COLLECTION_NAME_SHOULD_BE_SINGULAR,
      `collection name should be singular. ie: 'User' instead of 'Users'`
    );
  }

  // ensure collection name is TitleCase
  if (collection !== collection[0].toUpperCase() + collection.slice(1)) {
    throw new EleganteError(
      ErrorCode.COLLECTION_NAME_SHOULD_BE_TITLE_CASE,
      `collection name should be TitleCase. ie: 'User' instead of 'user'`
    );
  }

  bridge.params['collection'] = collection;

  return Object.freeze(bridge);
}
