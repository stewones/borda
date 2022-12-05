/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { finalize, Observable } from 'rxjs';
import { EleganteClient } from './EleganteClient';
import { EleganteError, ErrorCode } from './EleganteError';
import { isEmpty, isServer, log } from './utils';
import { fetch } from './fetch';
import { InternalFieldName, InternalHeaders } from './internal';
import { webSocketServer, getUrl, WebSocketCallback } from './websocket';
import { DocumentLiveQuery } from './types/livequery';

import {
  Query,
  Document,
  DocumentQuery,
  DocumentResponse,
  ChangeStreamOptions,
} from './types/query';

export function query<TSchema extends Document>(collection?: string) {
  const bridge: Query<TSchema> = {
    params: {
      collection,
      include: [],
      exclude: [],
      unlock: false,
    },

    /**
     * modifiers
     */

    collection: (name: string) => {
      // ensure collection name doesn't ends with "s" because
      // it's already means plural and for good architecture practices
      // we should keep it singular
      if (name.endsWith('s')) {
        throw new EleganteError(
          ErrorCode.COLLECTION_NAME_SHOULD_BE_SINGULAR,
          `collection name should be singular. ie: 'User' instead of 'Users'`
        );
      }

      // ensure collection name is TitleCase
      if (name !== name[0].toUpperCase() + name.slice(1)) {
        throw new EleganteError(
          ErrorCode.COLLECTION_NAME_SHOULD_BE_TITLE_CASE,
          `collection name should be TitleCase. ie: 'User' instead of 'user'`
        );
      }

      bridge.params['collection'] = name;
      return bridge;
    },

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

    findOne: (options) => {
      return bridge.run('findOne', options) as Promise<TSchema | void>;
    },

    update: (doc) => {
      return bridge.run('update', {}, doc) as Promise<void>;
    },

    insert: (doc) => {
      return bridge.run('insert', {}, doc) as Promise<TSchema>;
    },

    delete: () => {
      return bridge.run('delete', {}) as Promise<void>;
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
     * final methods
     */

    run: async (method, options, doc) => {
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

      if (['update', 'delete'].includes(method)) {
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

      let body: Document | DocumentQuery<TSchema>;

      log(method, bridge.params, options ?? '', doc ?? '');

      if (method === 'insert') {
        body = {
          ...doc,
        };
      } else {
        body = {
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
      }

      const docs = await fetch<DocumentResponse<TSchema>>(
        `${EleganteClient.params.serverURL}/${bridge.params['collection']}`,
        {
          method: 'POST',
          headers,
          body,
        }
      );

      if (isEmpty(docs)) {
        return undefined;
      }

      return docs;
    },

    on: (event, options?: ChangeStreamOptions) => {
      let wss: WebSocket;
      let wssFinished = false;
      let wssConnected = false;

      return new Observable<TSchema>((observer) => {
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
            if (wssFinished) {
              wss.close();
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
            }, 1 * 1000);
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

      return new Observable<TSchema>((observer) => {
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
            wss.close();
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
  return bridge;
}
