/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  BordaError,
  ErrorCode,
} from './Error';
import { fetcher, HttpMethod } from './fetcher';
import { InternalFieldName, InternalHeaders } from './internal';
import {
  AggregateOptions,
  BulkWriteResult,
  ChangeStreamOptions,
  Document,
  DocumentExtraOptions,
  DocumentFilter,
  DocumentOptions,
  DocumentPipeline,
  DocumentQuery,
  DocumentResponse,
  FindOptions,
  ManyInsertResponse,
  ManyUpdateResponse,
  ManyUpsertResponse,
  Projection,
  QueryMethod,
  Sort,
} from './types';
import { cleanKey, isBoolean, isEmpty, isServer, LocalStorage } from './utils';

export type RunResult<TSchema> =
  | number
  | TSchema
  | TSchema[]
  | ManyInsertResponse<TSchema>
  | ManyUpdateResponse
  | ManyUpsertResponse
  | BulkWriteResult
  | void;

export class BordaQuery<TSchema extends Document = Document> {
  #inspect!: boolean;
  #collection: string;
  #filter: DocumentFilter<TSchema> = {};
  #projection: Partial<{
    [key in keyof TSchema]: number;
  }> = {};
  #sort: Sort = {};
  #limit = 20;
  #skip = 0;
  #pipeline: DocumentPipeline<TSchema>[] = [];
  #include: string[] = [];
  #exclude: string[] = [];
  #unlock = false;

  get collection() {
    return this.#collection;
  }
  get inspect() {
    return this.#inspect;
  }

  constructor({
    inspect,
    collection,
  }: {
    collection: string;
    inspect?: boolean;
  }) {
    // ensure collection name doesn't end with "s" because
    // it's already means plural and for good db hygiene
    // we should keep it as singular
    if (collection.endsWith('s')) {
      throw new BordaError(
        ErrorCode.QUERY_SINGULAR_COLLECTION_NAME,
        `collection name should be singular. eg: 'User' instead of 'Users'`
      );
    }

    // ensure collection name is in TitleCase
    if (collection !== collection[0].toUpperCase() + collection.slice(1)) {
      throw new BordaError(
        ErrorCode.QUERY_TITLE_CASE_COLLECTION_NAME,
        `collection name should be TitleCase. eg: 'User' instead of 'user'`
      );
    }

    this.#collection = collection;
    this.#inspect = inspect ?? false;
  }

  /**
   * unlock can only be used in server environment
   * with proper ApiKey+ApiSecret defined
   */
  unlock(isUnlocked?: boolean) {
    if (!isBoolean(isUnlocked)) {
      isUnlocked = true;
    }

    if (!isServer() && isUnlocked) {
      throw new BordaError(
        ErrorCode.SERVER_UNLOCK_ONLY,
        `unlock can only be used in server environment`
      );
    }

    this.#unlock = isUnlocked;
    return this;
  }

  /**
   * doc modifiers
   */
  projection(project: Partial<Projection<TSchema>>) {
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

    this.#projection = newProject;
    return this;
  }

  sort(by: Sort) {
    this.#sort = by;
    return this;
  }

  filter(by: DocumentFilter<TSchema>) {
    this.#filter = by;
    return this;
  }

  limit(by: number) {
    this.#limit = by;
    return this;
  }

  skip(by: number) {
    this.#skip = by;
    return this;
  }

  include(fields: string[]) {
    this.#include = fields;
    return this;
  }

  exclude(fields: string[]) {
    this.#exclude = fields;
    return this;
  }

  pipeline(docs: DocumentPipeline<TSchema>[]) {
    this.#pipeline = docs ? docs : [];
    return this;
  }

  /**
   * find documents using mongo-like queries
   */
  find(options?: FindOptions & DocumentExtraOptions): Promise<TSchema[]> {
    return this.run('find', options) as Promise<TSchema[]>;
  }

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
  findOne(optionsOrObjectId: any, options?: any) {
    const hasDocModifier =
      !isEmpty(this.#projection) ||
      !isEmpty(this.#include) ||
      !isEmpty(this.#filter) ||
      !isEmpty(this.#pipeline);

    /**
     * in case we have objectId and modifiers
     * we need to run as findOne to make include and others work
     */
    if (typeof optionsOrObjectId === 'string' && hasDocModifier) {
      this.#filter = {
        _id: {
          $eq: optionsOrObjectId,
        },
      } as any;
    }

    return this.run(
      typeof optionsOrObjectId === 'string' && !hasDocModifier
        ? 'get'
        : 'findOne',
      typeof optionsOrObjectId === 'string' ? options ?? {} : optionsOrObjectId,
      {},
      typeof optionsOrObjectId === 'string' ? optionsOrObjectId : undefined
    ) as Promise<TSchema>;
  }

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
  update(objectIdOrDoc: any, docOrOptions?: Partial<TSchema>, options?: any) {
    return this.run(
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
  }

  updateMany(
    doc: TSchema,
    options?: DocumentExtraOptions
  ): Promise<ManyUpdateResponse> {
    return this.run(
      'updateMany',
      options ?? {},
      doc ?? {}
    ) as Promise<ManyUpdateResponse>;
  }

  insert(
    doc: Partial<TSchema>,
    options?: DocumentExtraOptions
  ): Promise<TSchema> {
    return this.run('insert', options ?? {}, doc) as Promise<TSchema>;
  }

  /**
   * insert many documents
   * The number of operations in each group cannot exceed the value of the maxWriteBatchSize of the database. As of MongoDB 3.6, this value is 100,000.
   * learn more https://www.mongodb.com/docs/manual/reference/method/db.collection.insertMany/
   */
  insertMany(
    docs: Partial<TSchema>[],
    options?: DocumentExtraOptions
  ): Promise<ManyInsertResponse<TSchema>> {
    return this.run('insertMany', options ?? {}, docs ?? []) as Promise<
      ManyInsertResponse<TSchema>
    >;
  }

  /**
   * update or insert a document
   */
  upsert(
    doc: Partial<TSchema>,
    options?: DocumentExtraOptions
  ): Promise<BulkWriteResult> {
    return this.run('upsert', options ?? {}, doc) as Promise<BulkWriteResult>;
  }

  /**
   * update or insert many documents
   */
  upsertMany(
    docs: Partial<TSchema>[],
    options?: DocumentExtraOptions
  ): Promise<ManyUpsertResponse> {
    return this.run(
      'upsertMany',
      options ?? {},
      docs ?? []
    ) as Promise<ManyUpsertResponse>;
  }

  /**
   * delete a document using mongo-like queries
   * or direclty by passing its objectId
   */
  delete(options?: DocumentExtraOptions): Promise<void>;
  delete(objectId: string, options?: DocumentExtraOptions): Promise<void>;
  delete(objectIdOrOptions?: any, options?: any) {
    return this.run(
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
  }

  deleteMany(options?: DocumentExtraOptions): Promise<ManyUpdateResponse> {
    return this.run('removeMany', options) as Promise<ManyUpdateResponse>;
  }

  /**
   * count documents using mongo-like queries
   */
  count(options?: FindOptions & DocumentExtraOptions): Promise<number> {
    return this.run('count', options) as Promise<number>;
  }

  /**
   * aggregate documents using mongo-like queries
   */
  aggregate(
    options?: AggregateOptions & DocumentExtraOptions
  ): Promise<TSchema[]> {
    return this.run('aggregate', options) as Promise<TSchema[]>;
  }

  /**
   * doc retrieval
   */
  run(
    method: QueryMethod,
    options?: DocumentOptions,
    docOrDocs?: Partial<TSchema> | Partial<TSchema>[],
    objectId?: string
  ): Promise<RunResult<TSchema>> {
    if (!options) {
      options = {};
    }
    if (
      this.#filter &&
      this.#filter['expiresAt'] &&
      isEmpty(this.#filter['expiresAt'])
    ) {
      const f = this.#filter as Document;
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

    if (!this.#collection) {
      throw new BordaError(
        ErrorCode.QUERY_REQUIRED_COLLECTION_NAME,
        'a collection name is required'
      );
    }

    if (['update', 'remove'].includes(method)) {
      if (isEmpty(this.#filter)) {
        throw new BordaError(
          ErrorCode.QUERY_FILTER_REQUIRED,
          'a filter is required for doc mutation. ie: update and delete'
        );
      }
    }

    if (!isEmpty(this.#pipeline) && method !== 'aggregate') {
      throw new BordaError(
        ErrorCode.QUERY_PIPELINE_AGGREGATE_ONLY,
        `pipeline can only be used for aggregate. you're trying to use "${method}()"`
      );
    }

    let { inspect } = options;

    inspect = inspect ?? this.#inspect;

    if (inspect) {
      console.log(method, 'query', JSON.stringify(this, null, 2));
      console.log(method, 'options', JSON.stringify(options, null, 2));

      if (!isEmpty(doc)) {
        console.log(method, 'doc', JSON.stringify(doc, null, 2));
      }

      if (!isEmpty(docs)) {
        console.log(
          method,
          'docs',
          docs.length,
          JSON.stringify(docs[0], null, 2)
        );
      }
    }

    const docQuery: DocumentQuery<TSchema> = {
      unlock: this.#unlock,
      collection: this.#collection,
      filter: this.#filter,
      projection: this.#projection,
      sort: this.#sort,
      limit: this.#limit,
      skip: this.#skip,
      include: this.#include,
      exclude: this.#exclude,
      pipeline: this.#pipeline,
      options,
      method,
      doc,
      docs,
      objectId,
    };

    // executed by the bridge
    return this.bridge(docQuery);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  on(event: any, options?: ChangeStreamOptions) {
    //
    return {} as any;
  }

  once() {
    //
    return {} as any;
  }

  bridge(docQuery: DocumentQuery<TSchema>) {
    console.log('bridge shoud be implemented from a consumer class', docQuery);
    return Promise.resolve({} as Promise<RunResult<TSchema>>);
  }

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
  //         throw new BordaError(
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
  //         throw new BordaError(
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
}

export class BordaClientQuery<
  TSchema extends Document = Document
> extends BordaQuery {
  #serverURL!: string;
  #serverKey!: string;
  #serverSecret!: string;
  #serverHeaderPrefix!: string;

  constructor({
    inspect,
    collection,
    serverURL,
    serverKey,
    serverSecret,
    serverHeaderPrefix,
  }: {
    collection: string;
    inspect?: boolean;
    serverURL: string;
    serverKey: string;
    serverSecret: string;
    serverHeaderPrefix: string;
  }) {
    super({
      inspect,
      collection,
    });
    this.#serverURL = serverURL;
    this.#serverKey = serverKey;
    this.#serverSecret = serverSecret;
    this.#serverHeaderPrefix = serverHeaderPrefix;
  }

  public override bridge({
    collection,
    pipeline,
    method,
    objectId,
    filter,
    doc,
    docs,
    options,
    unlock,
    projection,
    sort,
    limit,
    skip,
    include,
    exclude,
  }: DocumentQuery) {
    if (filter && filter['expiresAt'] && isEmpty(filter['expiresAt'])) {
      const f = filter as Document;
      f['expiresAt'] = {
        $exists: false,
      };
    }

    if (!this.#serverURL) {
      throw new BordaError(
        ErrorCode.SERVER_URL_UNDEFINED,
        'serverURL is not defined on client'
      );
    }

    if (['update', 'remove'].includes(method)) {
      if (isEmpty(filter)) {
        throw new BordaError(
          ErrorCode.QUERY_FILTER_REQUIRED,
          'a filter is required for doc mutation. ie: update and delete'
        );
      }
    }

    if (!isEmpty(pipeline) && method !== 'aggregate') {
      throw new BordaError(
        ErrorCode.QUERY_PIPELINE_AGGREGATE_ONLY,
        `pipeline can only be used for aggregate. you're trying to use "${method}()"`
      );
    }

    const { inspect } = options ?? {};

    const headers = {
      [`${this.#serverHeaderPrefix}-${InternalHeaders['apiKey']}`]:
        this.#serverKey,
      [`${this.#serverHeaderPrefix}-${InternalHeaders['apiMethod']}`]: method,
    };

    if (inspect) {
      headers[`${this.#serverHeaderPrefix}-${InternalHeaders['apiInspect']}`] =
        'true';
    }

    if (unlock) {
      headers[`${this.#serverHeaderPrefix}-${InternalHeaders['apiSecret']}`] =
        this.#serverSecret ?? '👀';
    }

    if (!isServer()) {
      const token = LocalStorage.get(
        `${this.#serverHeaderPrefix}-${InternalHeaders['apiToken']}`
      );

      if (token) {
        headers[`${this.#serverHeaderPrefix}-${InternalHeaders['apiToken']}`] =
          token;
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

    const source = fetcher<DocumentResponse<TSchema>>(
      `${this.#serverURL}/${collection}${
        ['get', 'put', 'delete'].includes(method) ? '/' + objectId : ''
      }`,
      {
        headers,
        body: method === 'get' ? null : docQuery,
        method: ['get', 'put', 'delete'].includes(method)
          ? (method.toUpperCase() as HttpMethod)
          : 'POST',
        direct: true,
      }
    );

    Reflect.defineMetadata(
      'key',
      cleanKey({
        collection,
        ...docQuery,
      }),
      source
    );

    return source;
  }
}
