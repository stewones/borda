import WebSocket, { MessageEvent } from 'isomorphic-ws';
import { finalize, Observable } from 'rxjs';

import { SignOptions } from './Auth';
import { ClientDefaultParams, ClientParams } from './Client';
import { EleganteError, ErrorCode } from './Error';
import { fetch, HttpMethod } from './fetch';
import { InternalFieldName, InternalHeaders, memo } from './internal';
import { log } from './log';
import {
  ChangeStreamOptions,
  Document,
  DocumentLiveQuery,
  DocumentQuery,
  DocumentResponse,
  LiveQueryMessage,
  ManyInsertResponse,
  ManyUpdateResponse,
  ManyUpsertResponse,
  Query,
  Session,
} from './types';
import { cleanKey, isBoolean, isEmpty, isServer } from './utils';
import { WebSocketFactory, webSocketServer } from './websocket';

export class Borda {
  params: ClientParams = {} as ClientParams;

  get auth() {
    return {
      become: (
        token: string,
        options?: Pick<SignOptions, 'validateSession'>
      ) => {
        if (isServer()) {
          throw new Error('become is not supported on server.');
        }

        const headers = {
          [`${this.params.serverHeaderPrefix}-${InternalHeaders['apiKey']}`]:
            this.params.apiKey,
          [`${this.params.serverHeaderPrefix}-${InternalHeaders['apiToken']}`]:
            token,
        };

        const shouldValidate = isBoolean(options?.validateSession)
          ? options?.validateSession
          : true;

        return shouldValidate
          ? fetch<Session>(`${this.params.serverURL}/me`, {
              method: 'GET',
              headers,
            }).then((session) => {
              this.params.sessionToken = session.token;
            })
          : Promise.resolve().then(() => {
              this.params.sessionToken = token;
            });
      },

      signUp: (
        from: {
          name: string;
          email: string;
          password: string;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          [key: string]: any;
        },
        options?: Pick<SignOptions, 'include' | 'exclude'>
      ) => {
        const headers = {
          [`${this.params.serverHeaderPrefix}-${InternalHeaders['apiKey']}`]:
            this.params.apiKey,
          [`${this.params.serverHeaderPrefix}-${InternalHeaders['apiMethod']}`]:
            'signUp',
        };

        if (!isServer()) {
          const token = this.params.sessionToken;
          if (token) {
            headers[
              `${this.params.serverHeaderPrefix}-${InternalHeaders['apiToken']}`
            ] = token;
          }
        } else {
          if (this.params.apiSecret) {
            headers[
              `${this.params.serverHeaderPrefix}-${InternalHeaders['apiSecret']}`
            ] = this.params.apiSecret;
          }
        }

        const include = options?.include ?? [];
        const exclude = options?.exclude ?? [];

        return fetch<Session>(`${this.params.serverURL}/User`, {
          method: 'POST',
          headers,
          body: {
            include,
            exclude,
            doc: from,
          },
        }).then((session) => {
          this.params.sessionToken = session.token;
          return session;
        });
      },

      signOut: () => {
        const headers = {
          [`${this.params.serverHeaderPrefix}-${InternalHeaders['apiKey']}`]:
            this.params.apiKey,
        };

        if (this.params.sessionToken) {
          headers[
            `${this.params.serverHeaderPrefix}-${InternalHeaders['apiToken']}`
          ] = this.params.sessionToken;
        }


        return fetch(`${this.params.serverURL}/me`, {
          method: 'DELETE',
          headers,
        }).then(() => {
          this.params.sessionToken = undefined;

          if (memo.size) {
            for (const [key, value] of memo) {
              if (key.startsWith('websocket:')) {
                value.close();
              }
            }
          }
        });
      },
    };
  }

  get socketBaseUrl() {
    const serverURL = this.params.serverURL;

    // replace port with socket port
    const socketURLWithPort = serverURL.replace(/:(\d+)/, `:1338`);

    // replace http:// or https:// with ws:// or wss://
    const socketProtocol = socketURLWithPort.startsWith('https://')
      ? 'wss://'
      : 'ws://';

    // replace socketURLWithPort with protocol considering both http and https
    const socketURLWithMount =
      socketProtocol + socketURLWithPort.replace(/https?:\/\//, '');

    const socketURL = this.params.liveQueryServerURL
      ? this.params.liveQueryServerURL
      : socketURLWithMount.replace(/\/[^/]*$/, '');

    return socketURL;
  }

  constructor(options: ClientParams) {
    if (isServer()) {
      throw new Error('Borda Browser cannot be used in server side');
    }

    this.params = {
      ...ClientDefaultParams,
      ...options,
    };

    if (!isServer() && this.params.validateSession) {
      if (this.params.apiSecret) {
        throw new EleganteError(
          ErrorCode.SERVER_SECRET_EXPOSED,
          'Server secret exposed in client'
        );
      }

      if (this.params.sessionToken) {
        this.auth.become(this.params.sessionToken);
      }
    }
  }

  query<TSchema extends Document = Document>(collection: string) {
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
          typeof objectIdOrDoc !== 'string' ? docOrOptions : options ?? {},
          // optional: doc
          typeof objectIdOrDoc !== 'string'
            ? objectIdOrDoc
            : docOrOptions
            ? docOrOptions
            : {},
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

      upsert: (doc, options?) => {
        return bridge.run('upsert', options ?? {}, doc) as Promise<TSchema>;
      },

      upsertMany: (docs, options?) => {
        return bridge.run(
          'upsertMany',
          options ?? {},
          docs ?? []
        ) as Promise<ManyUpsertResponse>;
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
        if (
          bridge.params.filter &&
          bridge.params.filter['expiresAt'] &&
          isEmpty(bridge.params.filter['expiresAt'])
        ) {
          const f = bridge.params.filter as Document;
          f['expiresAt'] = {
            $exists: false,
          };
        }

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

        if (!this.params.serverURL) {
          throw new EleganteError(
            ErrorCode.SERVER_URL_UNDEFINED,
            'serverURL is not defined on client'
          );
        }

        if (!bridge.params['collection']) {
          throw new EleganteError(
            ErrorCode.QUERY_REQUIRED_COLLECTION_NAME,
            'a collection name is required'
          );
        }

        if (['update', 'remove'].includes(method)) {
          if (isEmpty(bridge.params['filter'])) {
            throw new EleganteError(
              ErrorCode.QUERY_FILTER_REQUIRED,
              'a filter is required for doc mutation. ie: update and delete'
            );
          }
        }

        if (!isEmpty(bridge.params['pipeline']) && method !== 'aggregate') {
          throw new EleganteError(
            ErrorCode.QUERY_PIPELINE_AGGREGATE_ONLY,
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
        let headers = {
          [`${this.params.serverHeaderPrefix}-${InternalHeaders['apiKey']}`]:
            this.params.apiKey,
          [`${this.params.serverHeaderPrefix}-${InternalHeaders['apiMethod']}`]:
            method,
        };

        if (inspect) {
          headers[
            `${this.params.serverHeaderPrefix}-${InternalHeaders['apiInspect']}`
          ] = 'true';
        }

        if (unlock) {
          headers[
            `${this.params.serverHeaderPrefix}-${InternalHeaders['apiSecret']}`
          ] = this.params.apiSecret ?? '👀';
        }

        if (!isServer()) {
          const token = this.params.sessionToken;

          if (token) {
            headers[
              `${this.params.serverHeaderPrefix}-${InternalHeaders['apiToken']}`
            ] = token;
          }
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

        if (this.params.fetch?.headers) {
          headers = {
            ...headers,
            ...this.params.fetch.headers(),
          };
        }

        const source = fetch<DocumentResponse<TSchema>>(
          `${this.params.serverURL}/${bridge.params['collection']}${
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
          cleanKey({
            collection: bridge.params['collection'],
            ...docQuery,
          }),
          source
        );
        return source;
      },

      on: (event, options?: ChangeStreamOptions) => {
        let wss: WebSocket;
        let wssFinished = false;
        let wssConnected = false;

        let hasConnected = false;

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

        const key = `websocket:${cleanKey(body)}`;

        const source = new Observable<LiveQueryMessage<TSchema>>((observer) => {
          if (!this.params.serverURL) {
            throw new EleganteError(
              ErrorCode.SERVER_URL_UNDEFINED,
              'serverURL is not defined on client'
            );
          }

          const socketURLPathname = `/${bridge.params['collection']}`;
          const socketURL = this.socketBaseUrl + socketURLPathname;

          const webSocket: WebSocketFactory = {
            onOpen: (ws, ev) => {
              wss = ws;
              wssConnected = true;
              memo.set(key, wss);
            },

            onError: (ws, err) => {
              log('error', err, 'on', event, err, bridge.params['collection']);
            },

            onConnect: (ws) => {
              hasConnected = true;
              // send query to the server
              ws.send(JSON.stringify(body));
            },
            onMessage: (ws: WebSocket, message: MessageEvent) => {
              const data = message.data;
              try {
                observer.next(JSON.parse(data as string));
              } catch (err) {
                ws.close();
              }
            },
            onClose: (ws, ev) => {
              if (
                wssFinished ||
                ev?.code === 1008 ||
                [
                  'Invalid secret',
                  'Invalid key',
                  'Invalid session',
                  'Collection not allowed',
                  'Invalid query method',
                  'stream closed',
                ].includes(ev?.reason) ||
                !hasConnected
              ) {
                ws.close();
                observer.error(
                  `${ErrorCode.LIVE_QUERY_SOCKET_CLOSE}: ${
                    ev.reason || 'network error'
                  }`
                );
                observer.complete();
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
                webSocketServer(
                  socketURL,
                  this.params.apiKey,
                  this.params.sessionToken || null,
                  unlock ? this.params.apiSecret : null
                )(webSocket);
              }, 1 * 500);
            },
          };

          /**
           * connect to the server
           */
          webSocketServer(
            socketURL,
            this.params.apiKey,
            this.params.sessionToken
          )(webSocket);
        }).pipe(
          finalize(() => {
            log('on', event, 'unsubscribed', bridge.params);
            wssFinished = true;
            memo.delete(key);
            wss && wss.close();
          })
        );

        Reflect.defineMetadata('key', cleanKey(body), source);
        return source;
      },

      once: () => {
        let wss: WebSocket;
        return new Observable<LiveQueryMessage<TSchema>>((observer) => {
          if (!this.params.serverURL) {
            throw new EleganteError(
              ErrorCode.SERVER_URL_UNDEFINED,
              'serverURL is not defined on client'
            );
          }
          const socketURLPathname = `/${bridge.params['collection']}`;
          const socketURL = this.socketBaseUrl + socketURLPathname;

          webSocketServer(
            socketURL,
            this.params.apiKey,
            this.params.sessionToken
          )({
            onOpen: (ws, ev) => {
              wss = ws;
            },

            onError: (ws, err) => {
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
              ws.close(); // this is a one-time query
              const data = message.data ?? '';

              try {
                observer.next(JSON.parse(data as string));
                observer.complete(); // this is a one time query
              } catch (err) {
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
            wss.close();
          })
        );
      },
    };

    // ensure collection name doesn't end with "s" because
    // it's already means plural and for good db hygiene
    // we should keep it as singular
    if (collection.endsWith('s')) {
      throw new EleganteError(
        ErrorCode.QUERY_SINGULAR_COLLECTION_NAME,
        `collection name should be singular. ie: 'User' instead of 'Users'`
      );
    }

    // ensure collection name is in TitleCase
    if (collection !== collection[0].toUpperCase() + collection.slice(1)) {
      throw new EleganteError(
        ErrorCode.QUERY_TITLE_CASE_COLLECTION_NAME,
        `collection name should be TitleCase. ie: 'User' instead of 'user'`
      );
    }

    bridge.params['collection'] = collection;

    return Object.freeze(bridge);
  }

  runFunction<T extends Document = Document>(
    name: string,
    doc?: Document,
    options?: {
      headers?: Record<string, string>;
    }
  ) {
    if (!this.params.apiKey) {
      throw new EleganteError(
        ErrorCode.AUTH_INVALID_API_KEY,
        'API key required'
      );
    }

    if (!this.params.serverURL) {
      throw new EleganteError(
        ErrorCode.SERVER_URL_UNDEFINED,
        'serverURL is not defined on client'
      );
    }

    let headers = {
      [`${this.params.serverHeaderPrefix}-${InternalHeaders['apiKey']}`]:
        this.params.apiKey,
      ...options?.headers,
    };

    if (this.params.fetch?.headers) {
      headers = {
        ...headers,
        ...this.params.fetch.headers(),
      };
    }

    if (!isServer()) {
      const token = this.params.sessionToken;
      if (token) {
        headers[
          `${this.params.serverHeaderPrefix}-${InternalHeaders['apiToken']}`
        ] = token;
      }
    } else {
      if (this.params.apiSecret) {
        headers[
          `${this.params.serverHeaderPrefix}-${InternalHeaders['apiSecret']}`
        ] = this.params.apiSecret;
      }
    }

    const source = fetch<T>(`${this.params.serverURL}/functions/${name}`, {
      method: 'POST',
      headers,
      body: doc,
    });

    Reflect.defineMetadata('key', cleanKey({ function: name, ...doc }), source);

    return source;
  }
}
