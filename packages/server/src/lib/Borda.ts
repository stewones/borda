import {
  Elysia,
  ElysiaConfig,
} from 'elysia';
import {
  AggregateOptions,
  ChangeStreamOptions,
  Db,
  Document,
  FindOptions,
  Sort,
} from 'mongodb';
import {
  Observable,
  Subject,
} from 'rxjs';

import {
  DocumentEvent,
  DocumentExtraOptions,
  DocumentFilter,
  DocumentOptions,
  DocumentPipeline,
  DocumentQuery,
  EleganteError,
  ErrorCode,
  isEmpty,
  LiveQueryMessage,
  ManyInsertResponse,
  ManyUpdateResponse,
  ManyUpsertResponse,
  Projection,
  QRLParams,
  QueryMethod,
} from '@borda/sdk';

import {
  BordaFieldName,
  BordaHeaders,
} from './internal';
import {
  mongoConnect,
  mongoCreateIndexes,
} from './mongodb';
import {
  DocQRLFrom,
  parseQuery,
} from './parse';
import { createServer } from './rest';
import { serverPostFind } from './restPostFind';
import { serverPostInsert } from './restPostInsert';

export interface BordaParams {
  name?: string;
  inspect?: boolean;

  mongoURI?: string;

  serverKey?: string;
  serverSecret?: string;
  serverURL?: string;
  serverHeaderPrefix?: string;
  serverPoweredBy?: string;

  /**
   * Default to 1h for document time-to-live.
   * it means that some internal queries will hit memory and be invalidated on every hour.
   * _unless_ related docs are updated/deleted in the database, in this case cache is invalidated right away.
   */
  cacheTTL?: number;
  /**
   * when the `query.limit(...)` is not set, this setting will be applied.
   * to deactivate this setting, just set `query.unlock()` in your query
   * please note that unlocking queries is only available in the server-side.
   *
   * Default to 50 docs per query
   */
  queryLimit?: number;

  // plugins?: ElegantePlugin[];
  // liveQueryServerURL?: string;

  // custom Elysia config
  config?: Partial<ElysiaConfig>;
}

export interface BordaQuery<TSchema extends Document = Document> {
  params: QRLParams<TSchema>;
  options: FindOptions;

  /**
   * project 1st level fields for this query
   */
  projection(doc: Partial<Projection<TSchema>>): BordaQuery<TSchema>;

  /**
   * sort documents
   */
  sort(by: Sort): BordaQuery<TSchema>;

  /**
   * filter documents unsing mogo-like syntax
   */
  filter(by: DocumentFilter<TSchema>): BordaQuery<TSchema>;

  /**
   * limit results for this query
   */
  limit(by: number): BordaQuery<TSchema>;

  /**
   * skip results for this query
   */
  skip(by: number): BordaQuery<TSchema>;

  /**
   * pipeline documents using mongo-like syntax
   */
  pipeline(docs: DocumentPipeline<TSchema>): BordaQuery<TSchema>;

  /**
   * include pointer results for this query. can be dot notation. ie: ['product.owner.name']
   */
  include(fields: string[]): BordaQuery<TSchema>;

  /**
   * exclude any fields from the result. can be dot notation. ie: ['product.owner.sales']
   */
  exclude(fields: string[]): BordaQuery<TSchema>;

  /**
   * find documents using mongo-like queries
   */
  find(options?: FindOptions & DocumentExtraOptions): Promise<TSchema[]>;

  /**
   * find a document using mongo-like queries
   * or direclty by passing its objectId
   */
  findOne(objectId: string): Promise<TSchema>;
  findOne(
    objectId: string,
    options?: FindOptions & DocumentExtraOptions
  ): Promise<TSchema>;
  findOne(options?: DocumentExtraOptions): Promise<TSchema>;

  /**
   * update a document using mongo-like queries
   * or direclty by passing its objectId
   */
  update(doc: TSchema, options?: DocumentExtraOptions): Promise<void>;
  update(
    objectId: string,
    doc: TSchema,
    options?: DocumentExtraOptions
  ): Promise<void>;
  updateMany(
    doc: TSchema,
    options?: DocumentExtraOptions
  ): Promise<ManyUpdateResponse>;

  /**
   * insert a document
   */
  insert(
    doc: Partial<TSchema>,
    options?: DocumentExtraOptions
  ): Promise<TSchema>;

  /**
   * insert many documents
   * The number of operations in each group cannot exceed the value of the maxWriteBatchSize of the database. As of MongoDB 3.6, this value is 100,000.
   * learn more https://www.mongodb.com/docs/manual/reference/method/db.collection.insertMany/
   */
  insertMany(
    docs: Partial<TSchema>[],
    options?: DocumentExtraOptions
  ): Promise<ManyInsertResponse<TSchema>>;

  /**
   * update or insert a document
   */
  upsert(
    doc: Partial<TSchema>,
    options?: DocumentExtraOptions
  ): Promise<TSchema>;

  /**
   * update or insert many documents
   */
  upsertMany(
    docs: Partial<TSchema>[],
    options?: DocumentExtraOptions
  ): Promise<ManyUpsertResponse>;

  /**
   * delete a document using mongo-like queries
   * or direclty by passing its objectId
   */
  delete(options?: DocumentExtraOptions): Promise<void>;
  delete(objectId: string, options?: DocumentExtraOptions): Promise<void>;
  deleteMany(options?: DocumentExtraOptions): Promise<ManyUpdateResponse>;

  /**
   * count documents using mongo-like queries
   */
  count(options?: FindOptions & DocumentExtraOptions): Promise<number>;

  /**
   * aggregate documents using mongo-like queries
   */
  aggregate(
    options?: AggregateOptions & DocumentExtraOptions
  ): Promise<TSchema[]>;

  /**
   * run mongo query methods
   */
  run(
    method: QueryMethod,
    options?: DocumentOptions,
    docOrDocs?: Partial<TSchema> | Partial<TSchema>[],
    objectId?: string
  ): Promise<
    | number
    | TSchema
    | TSchema[]
    | ManyInsertResponse<TSchema>
    | ManyUpdateResponse
    | ManyUpsertResponse
    | void
  >;

  /**
   * live queries
   */
  on(
    event: DocumentEvent,
    options?: ChangeStreamOptions
  ): Observable<LiveQueryMessage<TSchema>>;

  /**
   * similiar to find but run on websockets
   */
  once(): Observable<LiveQueryMessage<TSchema>>;
}
export class Borda {
  #name!: string;
  #inspect!: boolean;
  #mongoURI!: string;
  #serverKey!: string;
  #serverSecret!: string;
  #serverURL!: string;
  #serverHeaderPrefix!: string;
  #serverPoweredBy!: string;
  #cacheTTL!: number;
  #queryLimit!: number;

  #server!: Elysia;
  #db!: Db;
  #cache!: Map<string, Document>; // @todo move the global Cache to here

  public on = {
    databaseConnect: new Subject<{
      db: Db;
      name: string;
    }>(),
  };

  get db() {
    return this.#db;
  }

  get name() {
    return this.#name;
  }

  get inspect() {
    return this.#inspect;
  }

  get mongoURI() {
    return this.#mongoURI;
  }

  get serverKey() {
    return this.#serverKey;
  }

  get serverSecret() {
    return this.#serverSecret;
  }

  get serverURL() {
    return this.#serverURL;
  }

  get serverHeaderPrefix() {
    return this.#serverHeaderPrefix;
  }

  get serverPoweredBy() {
    return this.#serverPoweredBy;
  }

  get cacheTTL() {
    return this.#cacheTTL;
  }

  get queryLimit() {
    return this.#queryLimit;
  }

  get app() {
    return this.#server;
  }

  constructor(params?: Partial<BordaParams>) {
    const {
      name,
      inspect,
      mongoURI,
      serverKey,
      serverSecret,
      serverURL,
      serverHeaderPrefix,
      serverPoweredBy,
      cacheTTL,
      queryLimit,
      config,
    } = params || {};

    // set default params
    this.#inspect = inspect || false;
    this.#name = name || 'default';
    this.#mongoURI =
      mongoURI ||
      process.env['BORDA_MONGO_URI'] ||
      'mongodb://127.0.0.1:27017/borda-dev';
    this.#serverKey =
      serverKey || process.env['BORDA_SERVER_KEY'] || 'b-o-r-d-a';
    this.#serverSecret =
      serverSecret || process.env['BORDA_SERVER_SECRET'] || 's-e-c-r-e-t';
    this.#serverURL =
      serverURL || process.env['BORDA_SERVER_URL'] || 'http://127.0.0.1:1337';
    this.#serverHeaderPrefix =
      serverHeaderPrefix ||
      process.env['BORDA_SERVER_HEADER_PREFIX'] ||
      'X-Borda';
    this.#serverPoweredBy =
      serverPoweredBy || process.env['BORDA_SERVER_POWERED_BY'] || 'Borda';
    this.#cacheTTL =
      cacheTTL ||
      parseFloat(process.env['BORDA_CACHE_TTL'] ?? '0') ||
      1 * 1000 * 60 * 60;
    this.#queryLimit = queryLimit || 50;

    // instantiate the server
    this.#server = createServer({
      config,
      serverHeaderPrefix: this.#serverHeaderPrefix,
      serverKey: this.#serverKey,
      serverSecret: this.#serverSecret,
      name: this.#name,
      poweredBy: this.#serverPoweredBy,
    });
  }

  log(...args: unknown[]) {
    if (this.#inspect) {
      console.log(...args);
    }
  }

  ping() {
    return fetch(`${this.#serverURL}/ping`, {
      headers: {
        'Content-Type': 'text/html',
        [`${this.#serverHeaderPrefix}-${BordaHeaders['apiKey']}`]:
          this.#serverKey,
      },
    }).then((res) => res.text());
  }

  async server() {
    this.#db = await mongoConnect({ mongoURI: this.#mongoURI });
    await mongoCreateIndexes({ db: this.#db });
    this.on.databaseConnect.next({
      db: this.#db,
      name: this.#name,
    });
    return this.#server;
  }

  query<TSchema extends Document = Document>(collection: string) {
    const bridge: BordaQuery<TSchema> = {
      params: {
        collection: '',
        filter: {},
        include: [],
        exclude: [],
      },

      options: {},

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
        for (const key in BordaFieldName) {
          if (keys.includes(key)) {
            newProject[BordaFieldName[key]] = newProject[key];
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
        } = bridge.params;

        let { inspect } = options;

        inspect = inspect ?? this.#inspect;

        if (inspect) {
          console.log(method, 'params', JSON.stringify(bridge.params));
          console.log(method, 'options', JSON.stringify(options));

          if (!isEmpty(doc)) {
            console.log(method, 'doc', JSON.stringify(doc));
          }

          if (!isEmpty(docs)) {
            console.log(method, 'docs', docs.length, docs[0]);
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

        const docQRLFrom: DocQRLFrom = {
          ...docQuery,
          method,
          collection: bridge.params['collection'],
        };

        const docQRL = parseQuery({
          from: docQRLFrom,
          db: this.#db,
          inspect: inspect ?? false,
        });

        if (['find', 'findOne'].includes(method)) {
          return serverPostFind<TSchema>({
            docQRL,
            method,
            inspect,
          });
        }

        if (method === 'insert') {
          return serverPostInsert<TSchema>({
            docQRL,
            inspect,
          });
        }

        return Promise.reject('method not implemented');
      },

      on: (event, options?: ChangeStreamOptions) => {
        //
      },
      once: () => {
        //
      },

      //   on: (event, options?: ChangeStreamOptions) => {
      //     let wss: WebSocket;
      //     let wssFinished = false;
      //     let wssConnected = false;

      //     let hasConnected = false;

      //     const {
      //       filter,
      //       limit,
      //       skip,
      //       sort,
      //       projection,
      //       include,
      //       exclude,
      //       pipeline,
      //       unlock,
      //       collection,
      //     } = bridge.params;

      //     const body: DocumentLiveQuery = {
      //       options,
      //       projection,
      //       sort,
      //       limit,
      //       skip,
      //       include,
      //       exclude,
      //       collection,
      //       event,
      //       filter: filter ?? ({} as any),
      //       pipeline: pipeline ?? ([] as any),
      //       unlock: unlock ?? false,
      //       method: 'on',
      //     };

      //     const key = `websocket:${cleanKey(body)}`;

      //     const source = new Observable<LiveQueryMessage<TSchema>>((observer) => {
      //       if (!EleganteClient.params.serverURL) {
      //         throw new EleganteError(
      //           ErrorCode.SERVER_URL_UNDEFINED,
      //           'serverURL is not defined on client'
      //         );
      //       }

      //       const socketURLPathname = `/${bridge.params['collection']}`;
      //       const socketURL = getUrl() + socketURLPathname;

      //       const webSocket: WebSocketFactory = {
      //         onOpen: (ws, ev) => {
      //           wss = ws;
      //           wssConnected = true;
      //           memo.set(key, wss);
      //           log('on', event, bridge.params['collection'], bridge.params);
      //         },

      //         onError: (ws, err) => {
      //           log('error', err, 'on', event, err, bridge.params['collection']);
      //         },

      //         onConnect: (ws) => {
      //           hasConnected = true;
      //           // send query to the server
      //           ws.send(JSON.stringify(body));
      //         },

      //         onMessage: (ws: WebSocket, message: MessageEvent) => {
      //           const data = message.data;
      //           try {
      //             observer.next(JSON.parse(data as string));
      //           } catch (err) {
      //             log('on', event, bridge.params['collection'], 'error', err);
      //             ws.close();
      //           }
      //         },

      //         onClose: (ws, ev) => {
      //           if (
      //             wssFinished ||
      //             ev?.code === 1008 ||
      //             [
      //               'Invalid secret',
      //               'Invalid key',
      //               'Invalid session',
      //               'Collection not allowed',
      //               'Invalid query method',
      //               'stream closed',
      //             ].includes(ev?.reason) ||
      //             !hasConnected
      //           ) {
      //             ws.close();
      //             observer.error(
      //               `${ErrorCode.LIVE_QUERY_SOCKET_CLOSE}: ${
      //                 ev.reason || 'network error'
      //               }`
      //             );
      //             observer.complete();
      //             return;
      //           }

      //           if (wssConnected) {
      //             wssConnected = false;
      //             log(
      //               'on',
      //               event,
      //               bridge.params['collection'],
      //               'disconnected',
      //               ev.reason,
      //               bridge.params
      //             );
      //           }

      //           setTimeout(() => {
      //             log(
      //               'on',
      //               event,
      //               bridge.params['collection'],
      //               'trying to reconnect',
      //               bridge.params
      //             );
      //             webSocketServer(
      //               socketURL,
      //               EleganteClient.params.apiKey,
      //               EleganteClient.params.sessionToken || null,
      //               unlock ? EleganteClient.params.apiSecret : null
      //             )(webSocket);
      //           }, 1 * 500);
      //         },
      //       };

      //       /**
      //        * connect to the server
      //        */
      //       webSocketServer(
      //         socketURL,
      //         EleganteClient.params.apiKey,
      //         EleganteClient.params.sessionToken || null,
      //         unlock ? EleganteClient.params.apiSecret : null
      //       )(webSocket);
      //     }).pipe(
      //       finalize(() => {
      //         log('on', event, 'unsubscribed', bridge.params);
      //         wssFinished = true;
      //         memo.delete(key);
      //         wss && wss.close();
      //       })
      //     );

      //     Reflect.defineMetadata('key', cleanKey(body), source);
      //     return source;
      //   },

      //   once: () => {
      //     let wss: WebSocket;
      //     const { unlock } = bridge.params;
      //     return new Observable<LiveQueryMessage<TSchema>>((observer) => {
      //       if (!EleganteClient.params.serverURL) {
      //         throw new EleganteError(
      //           ErrorCode.SERVER_URL_UNDEFINED,
      //           'serverURL is not defined on client'
      //         );
      //       }
      //       const socketURLPathname = `/${bridge.params['collection']}`;
      //       const socketURL = getUrl() + socketURLPathname;

      //       webSocketServer(
      //         socketURL,
      //         EleganteClient.params.apiKey,
      //         EleganteClient.params.sessionToken || null,
      //         unlock ? EleganteClient.params.apiSecret : null
      //       )({
      //         onOpen: (ws, ev) => {
      //           wss = ws;
      //           log('once', bridge.params['collection'], bridge.params);
      //         },

      //         onError: (ws, err) => {
      //           log('error', 'once', bridge.params['collection'], err);
      //           observer.error(err);
      //           ws.close();
      //         },

      //         onConnect: (ws) => {
      //           const {
      //             filter,
      //             limit,
      //             skip,
      //             sort,
      //             projection,
      //             include,
      //             exclude,
      //             pipeline,
      //             unlock,
      //             collection,
      //           } = bridge.params;

      //           const body: DocumentLiveQuery = {
      //             projection,
      //             sort,
      //             limit,
      //             skip,
      //             include,
      //             exclude,
      //             pipeline,
      //             collection,
      //             filter: filter ?? ({} as any),
      //             unlock: unlock ?? false,
      //             method: 'once',
      //           };

      //           // send query to the server
      //           ws.send(JSON.stringify(body));
      //         },

      //         onMessage: (ws, message) => {
      //           ws.close(); // this is a one-time query
      //           const data = message.data ?? '';

      //           try {
      //             observer.next(JSON.parse(data as string));
      //             observer.complete(); // this is a one time query
      //           } catch (err) {
      //             log('once', bridge.params['collection'], err);
      //             observer.error(err);
      //           }
      //         },

      //         onClose: (ws, ev) => {
      //           // since it's a one-time query, we don't need to reconnect
      //           observer.complete();
      //         },
      //       });
      //     }).pipe(
      //       finalize(() => {
      //         log(
      //           'once',
      //           bridge.params['collection'],
      //           'unsubscribed',
      //           bridge.params
      //         );
      //         wss.close();
      //       })
      //     );
      //   },
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
}
