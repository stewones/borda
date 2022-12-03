/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { finalize, Observable } from 'rxjs';
import { ElegClient } from './ElegClient';
import { ElegError, ErrorCode } from './ElegError';
import { isEmpty, log } from './utils';
import { fetch } from './fetch';
import { InternalFieldName } from './internal';
import { webSocketServer, getUrl, WebSocketCallback } from './websocket';

import {
  Query,
  Document,
  DocumentQuery,
  DocumentQueryUnlock,
  ChangeStreamOptions,
} from './types/query';

export function query<TSchema extends Document>() {
  const bridge: Query<TSchema> = {
    params: {
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
        throw new ElegError(
          ErrorCode.COLLECTION_NAME_SHOULD_BE_SINGULAR,
          `collection name should be singular. ie: 'User' instead of 'Users'`
        );
      }

      // ensure collection name is TitleCase
      if (name !== name[0].toUpperCase() + name.slice(1)) {
        throw new ElegError(
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
      for (const k in project) {
        newProject['_p_' + k] = project[k];
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
      return bridge.run('findOne', options) as Promise<TSchema>;
    },

    update: (doc) => {
      return bridge.run('update', {}, doc) as Promise<void>;
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
      bridge.params['unlock'] = isUnlocked;
      return bridge;
    },

    /**
     * final methods
     */

    run: async (method, options, doc) => {
      if (!ElegClient.params.serverURL) {
        throw new ElegError(
          ErrorCode.SERVER_URL_UNDEFINED,
          'serverURL is not defined on client'
        );
      }

      if (!bridge.params['collection']) {
        throw new ElegError(
          ErrorCode.COLLECTION_REQUIRED,
          'a collection name is required'
        );
      }

      if (['update', 'delete'].includes(method)) {
        if (isEmpty(bridge.params['filter'])) {
          throw new ElegError(
            ErrorCode.FILTER_REQUIRED_FOR_DOC_MUTATION,
            'a filter is required for doc mutation. ie: update and delete'
          );
        }
      }

      log(method, bridge.params, options ?? '');

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

      const body: DocumentQuery<TSchema> = {
        method,
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

      const headers = {
        [`${ElegClient.params.serverHeaderPrefix}-Api-Key`]:
          ElegClient.params.apiKey,
      };

      if (unlock) {
        headers[`${ElegClient.params.serverHeaderPrefix}-Secret-Key`] =
          ElegClient.params.apiSecret ??
          'THIS_IS_A_SECRET_KEY_ONLY_USED_IN_SERVER';
      }

      const docs = await fetch(
        `${ElegClient.params.serverURL}/${bridge.params['collection']}`,
        {
          method: 'POST',
          headers,
          body,
        }
      );

      if (!docs) {
        return [];
      }

      return docs;
    },

    on: (event, options?: ChangeStreamOptions) => {
      let wss: WebSocket;
      let wssFinished = false;
      return new Observable<TSchema>((observer) => {
        if (!ElegClient.params.serverURL) {
          throw new ElegError(
            ErrorCode.SERVER_URL_UNDEFINED,
            'serverURL is not defined on client'
          );
        }
        const socketURLPathname = `/${bridge.params['collection']}`;
        const socketURL = getUrl() + socketURLPathname;

        const webSocket: WebSocketCallback = {
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

            const body: DocumentQueryUnlock = {
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

          onOpen: (ws, ev) => {
            log('on', bridge.params);
            wss = ws;
          },

          onMessage: (ws, message) => {
            const data = message.data;
            try {
              observer.next(JSON.parse(data));
            } catch (err) {
              log(err);
              ws.close();
            }
          },

          onError: (ws, err) => ws.close(),

          onClose: (ws, ev) => {
            if (wssFinished) return;
            log('Disconnected from LiveQuery Server', ev.reason, bridge.params);
            setTimeout(() => {
              log('Trying to reconnect to LiveQuery Server', bridge.params);
              webSocketServer(socketURL)(webSocket);
            }, 5 * 1000);
          },
        };

        /**
         * connect to the server
         */
        webSocketServer(socketURL)(webSocket);
      }).pipe(
        finalize(() => {
          log('unsubscribed', bridge.params);
          wssFinished = true;
          wss.close();
        })
      );
    },

    once: () => {
      return new Observable((observer) => {
        if (!ElegClient.params.serverURL) {
          throw new ElegError(
            ErrorCode.SERVER_URL_UNDEFINED,
            'serverURL is not defined on client'
          );
        }
        const socketURLPathname = `/${bridge.params['collection']}`;
        const socketURL = getUrl() + socketURLPathname;

        webSocketServer(socketURL)({
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

            const body: DocumentQueryUnlock = {
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
              method: 'on',
            };

            // send query to the server
            ws.send(JSON.stringify(body));
          },

          onOpen: (ws, ev) => log('once', bridge.params),

          onMessage: (ws, message) => {
            ws.close(); // this is a one time query
            const data = message.data;
            try {
              observer.next(JSON.parse(data));
              observer.complete(); // this is a one time query
            } catch (err) {
              observer.error(err);
              observer.complete(); // this is a one time query
            }
          },

          onError: (ws, err) => {
            observer.error(err);
            observer.complete();
            ws.close();
          },

          onClose: (ws, ev) => {
            // since it's a one time query, we don't need to reconnect
            observer.error(ev);
            observer.complete();
            ws.close();
          },
        });
      });
    },
  };
  return bridge;
}
