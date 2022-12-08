/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { finalize, Observable } from 'rxjs';
import { EleganteClient } from './EleganteClient';
import { EleganteError, ErrorCode } from './EleganteError';
import { isEmpty, isServer, LocalStorage } from './utils';
import { fetch, HttpMethod } from './fetch';
import { InternalFieldName, InternalHeaders } from './internal';
import { webSocketServer, getUrl, WebSocketCallback } from './websocket';
import { DocumentLiveQuery, LiveQueryMessage } from './types/livequery';

import {
  Query,
  Document,
  DocumentQuery,
  DocumentResponse,
  ChangeStreamOptions,
  QRLParams,
} from './types/query';
import { log } from './log';

export function query<TSchema extends Document>(collection: string) {
  const bridge: Query<TSchema> = {
    keyrl: '',
    params: {
      collection: '',
      projection: {},
      filter: {},
    },

    /**
     * modifiers
     */

    projection: (project) => {
      /**
       * applies a little hack to make sure the projection
       * also work with pointers. ie: _p_fieldName
       */
      const newProject: any = { ...project };

      for (const fieldName in project) {
        newProject['_p_' + fieldName] = project[fieldName];
      }

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
      bridge.params['filter'] = by;
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
      bridge.params['pipeline'] = docs;
      return bridge;
    },

    /**
     * methods
     */

    find: (options) => {
      return bridge.run('find', options) as Promise<TSchema[]>;
    },

    findOne: (optionsOrObjectId) => {
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
        };
      }

      return bridge.run(
        typeof optionsOrObjectId === 'string' && !hasDocModifier
          ? 'get'
          : 'findOne',
        typeof optionsOrObjectId === 'string' ? {} : optionsOrObjectId,
        {},
        typeof optionsOrObjectId === 'string' ? optionsOrObjectId : undefined
      ) as Promise<TSchema | void>;
    },

    update: (objectIdOrDoc, doc?: Document) => {
      return bridge.run(
        typeof objectIdOrDoc === 'string' ? 'put' : 'update', // method
        {}, // options
        typeof objectIdOrDoc === 'string' ? doc : objectIdOrDoc, // optional: doc
        typeof objectIdOrDoc === 'string' ? objectIdOrDoc : undefined //  optional: objectId
      ) as Promise<void>;
    },

    insert: (doc) => {
      return bridge.run('insert', {}, doc) as Promise<TSchema>;
    },

    delete: (objectId?: string) => {
      return bridge.run(
        typeof objectId === 'string' ? 'delete' : 'remove',
        {},
        {},
        objectId
      ) as Promise<void>;
    },

    count: (options) => {
      return bridge.run('count', options) as Promise<number>;
    },

    aggregate: (options) => {
      return bridge.run('aggregate', options) as Promise<Document[]>;
    },

    unlock: (isUnlocked) => {
      /**
       * unlock can only be used in server environment
       * with proper ApiKey+ApiSecret defined
       */
      if (!isServer()) {
        throw new EleganteError(
          ErrorCode.SERVER_UNLOCK_ONLY,
          `unlock can only be used in server environment`
        );
      }

      bridge.params['unlock'] = isUnlocked;
      return bridge;
    },

    /**
     * retrieval methods
     */

    run: async (method, options, doc?, objectId?) => {
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

      const headers = {
        [`${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiKey']}`]:
          EleganteClient.params.apiKey,
        [`${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiMethod']}`]:
          method,
      };

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

      log(method, JSON.stringify(bridge.params), options ?? '', doc ?? '');

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
      };

      const docs = await fetch<DocumentResponse<TSchema>>(
        `${EleganteClient.params.serverURL}/${bridge.params['collection']}${
          ['get', 'put', 'delete'].includes(method) ? '/' + objectId : ''
        }`,
        {
          method: ['get', 'put', 'delete'].includes(method)
            ? (method.toUpperCase() as HttpMethod)
            : 'POST',
          headers,
          body: method === 'get' ? null : docQuery,
        }
      );

      if (isEmpty(docs)) {
        return method === 'find' ? [] : undefined;
      }

      return docs;
    },

    on: (event, options?: ChangeStreamOptions) => {
      let wss: WebSocket;
      let wssFinished = false;
      let wssConnected = false;

      return new Observable<LiveQueryMessage<TSchema>>((observer) => {
        if (!EleganteClient.params.serverURL) {
          throw new EleganteError(
            ErrorCode.SERVER_URL_UNDEFINED,
            'serverURL is not defined on client'
          );
        }

        const socketURLPathname = `/${bridge.params['collection']}`;
        const socketURL = getUrl() + socketURLPathname;

        const webSocket: WebSocketCallback = {
          onOpen: (ws, ev) => {
            wss = ws;
            wssConnected = true;
            log('on', event, bridge.params['collection'], bridge.params);
          },

          onError: (ws, err) => {
            log('error', 'on', event, err, bridge.params['collection']);
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
              options,
              filter,
              projection,
              sort,
              limit,
              skip,
              include,
              exclude,
              pipeline,
              unlock,
              collection,
              event,
              method: 'on',
            };

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
      }).pipe(
        finalize(() => {
          log('on', event, 'unsubscribed', bridge.params);
          wssFinished = true;
          wss.close();
        })
      );
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
              filter,
              projection,
              sort,
              limit,
              skip,
              include,
              exclude,
              pipeline,
              unlock,
              collection,
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

    /**
     * extended methods
     */
    key: (id: string) => {
      bridge.params['keyrl'] = id;
      return bridge;
    },
    qrl: () => {
      return bridge.params['keyrl']
        ? bridge.params['keyrl']
        : JSON.stringify(bridge.params);
    },
  };

  // ensure collection name doesn't ends with "s" because
  // it's already means plural and for good architecture practices
  // we should keep it singular
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

  return bridge;
}
