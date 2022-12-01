/* eslint-disable @typescript-eslint/no-explicit-any */

import { ElegClient } from './ElegClient';
import { ElegError, ErrorCode } from './ElegError';
import { log } from './utils';
import { fetch } from './fetch';
import { InternalFieldName } from './internal';

export declare interface Document {
  [key: string]: any;
}
export interface DocumentQuery<T = Document> {
  filter: FilterOperations<T> | undefined;
  limit: number | undefined;
  skip: number | undefined;
  sort: Sort | undefined;
  projection: T | undefined;
  method: QueryMethod | null;
  options: FindOptions | undefined;
  pipeline: Document[];
  include: string[];
  exclude: string[];
}

export declare type QueryMethod =
  | 'find'
  | 'findOne'
  | 'count'
  | 'aggregate'

  // @todo
  | 'findOneAndDelete'
  | 'findOneAndReplace'
  | 'findOneAndUpdate';

export declare interface Query<TSchema = Document> {
  params: { [key: string]: any };

  /**
   * set a mongo collection name for this query
   */
  collection(name: string): Query<TSchema>;

  /**
   * project 1st level fields for this query
   */
  projection(
    doc: Partial<{
      [key in keyof TSchema]: number;
    }>
  ): Query<TSchema>;

  /**
   * sort documents
   */
  sort(by: Sort): Query<TSchema>;

  /**
   * filter documents unsing mogo-like syntax
   */
  filter(by: FilterOperations<TSchema>): Query<TSchema>;

  /**
   * limit results for this query
   */
  limit(by: number): Query<TSchema>;

  /**
   * skip results for this query
   */
  skip(by: number): Query<TSchema>;

  /**
   * pipeline documents using mongo-like syntax
   */
  pipeline(docs: Document[]): Query<TSchema>;

  /**
   * include pointer results for this query. can be dot notation. ie: ['product.owner.name']
   */
  include(fields: string[]): Query<TSchema>;

  /**
   * exclude any fields from the result. can be dot notation. ie: ['product.owner.sales']
   */
  exclude(fields: string[]): Query<TSchema>;

  /**
   * find documents using mongo-like queries
   */
  find(options?: FindOptions): Promise<TSchema[]>;

  /**
   * find a document using mongo-like queries
   */
  findOne(options?: FindOptions): Promise<TSchema | void>;

  /**
   * count documents using mongo-like queries
   */
  count(options?: FindOptions): Promise<number>;

  /**
   * aggregate documents using mongo-like queries
   */
  aggregate(options?: AggregateOptions): Promise<Document[]>;

  /**
   * run mongo query methods
   */
  run(
    method: QueryMethod,
    options?: FindOptions
  ): Promise<number | TSchema | TSchema[] | Document[]>;

  /**
   * the unlock method appends the apiSecret to the header.
   * if valid you can make server-wide operations without restrictions.
   * make sure to only use this when running on server to not expose your api secret.
   */
  unlock(isUnlocked: boolean): Query<TSchema>;
}

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

    count: (options) => {
      return bridge.run('count', options) as Promise<number>;
    },

    aggregate: (options) => {
      return bridge.run('aggregate', options) as Promise<Document[]>;
    },

    run: async (method, options) => {
      log(method, bridge.params, options ?? '');

      if (!ElegClient.params.serverURL) {
        throw new ElegError(
          ErrorCode.SERVER_URL_UNDEFINED,
          'serverURL is not defined on client'
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

    /**
     * internal
     */
    unlock: (isUnlocked) => {
      bridge.params['unlock'] = isUnlocked;
      return bridge;
    },
  };
  return bridge;
}

export declare class ReadConcern {
  level: ReadConcernLevel | string;
  /** Constructs a ReadConcern from the read concern level.*/
  constructor(level: ReadConcernLevel);
  /**
   * Construct a ReadConcern given an options object.
   *
   * @param options - The options object from which to extract the write concern.
   */
  static fromOptions(options?: {
    readConcern?: ReadConcernLike;
    level?: ReadConcernLevel;
  }): ReadConcern | undefined;
  static get MAJORITY(): 'majority';
  static get AVAILABLE(): 'available';
  static get LINEARIZABLE(): 'linearizable';
  static get SNAPSHOT(): 'snapshot';
  toJSON(): Document;
}

export declare const ReadConcernLevel: Readonly<{
  readonly local: 'local';
  readonly majority: 'majority';
  readonly linearizable: 'linearizable';
  readonly available: 'available';
  readonly snapshot: 'snapshot';
}>;

export declare type ReadConcernLevel =
  typeof ReadConcernLevel[keyof typeof ReadConcernLevel];

export declare type ReadConcernLike =
  | ReadConcern
  | {
      level: ReadConcernLevel;
    }
  | ReadConcernLevel;

export declare type ReadPreferenceLike = ReadPreferenceMode;

export declare const ReadPreferenceMode: Readonly<{
  readonly primary: 'primary';
  readonly primaryPreferred: 'primaryPreferred';
  readonly secondary: 'secondary';
  readonly secondaryPreferred: 'secondaryPreferred';
  readonly nearest: 'nearest';
}>;

export declare type ReadPreferenceMode =
  typeof ReadPreferenceMode[keyof typeof ReadPreferenceMode];

export declare type TagSet = {
  [key: string]: string;
};
export declare interface HedgeOptions {
  /** Explicitly enable or disable hedged reads. */
  enabled?: boolean;
}

export declare interface ReadPreferenceOptions {
  /** Max secondary read staleness in seconds, Minimum value is 90 seconds.*/
  maxStalenessSeconds?: number;
  /** Server mode in which the same query is dispatched in parallel to multiple replica set members. */
  hedge?: HedgeOptions;
}

export declare interface CollectionOptions {
  /** Specify a read concern for the collection. (only MongoDB 3.2 or higher supported) */
  readConcern?: ReadConcernLike;
  /** The preferred read preference (ReadPreference.PRIMARY, ReadPreference.PRIMARY_PREFERRED, ReadPreference.SECONDARY, ReadPreference.SECONDARY_PREFERRED, ReadPreference.NEAREST). */
  readPreference?: ReadPreferenceLike;
}

export declare interface CollationOptions {
  locale: string;
  caseLevel?: boolean;
  caseFirst?: string;
  strength?: number;
  numericOrdering?: boolean;
  alternate?: string;
  maxVariable?: string;
  backwards?: boolean;
  normalization?: boolean;
}

export declare type Sort =
  | string
  | Exclude<
      SortDirection,
      {
        $meta: string;
      }
    >
  | string[]
  | {
      [key: string]: SortDirection;
    }
  | Map<string, SortDirection>
  | [string, SortDirection][]
  | [string, SortDirection];

export declare type SortDirection =
  | 1
  | -1
  | 'asc'
  | 'desc'
  | 'ascending'
  | 'descending'
  | {
      $meta: string;
    };

export declare type Hint = string | Document;

export declare interface FindOptions extends CollectionOptions {
  /** Sets the limit of documents returned in the query. */
  limit?: number;
  /** Set to sort the documents coming back from the query. Array of indexes, `[['a', 1]]` etc. */
  sort?: Sort;
  /** The fields to return in the query. Object of fields to either include or exclude (one of, not both), `{'a':1, 'b': 1}` **or** `{'a': 0, 'b': 0}` */
  projection?: Document;
  /** Set to skip N documents ahead in your query (useful for pagination). */
  skip?: number;
  /** Tell the query to use specific indexes in the query. Object of indexes to use, `{'_id':1}` */
  hint?: Hint;
  /** Specify if the cursor can timeout. */
  timeout?: boolean;
  /** Specify if the cursor is tailable. */
  tailable?: boolean;
  /** Specify if the cursor is a tailable-await cursor. Requires `tailable` to be true */
  awaitData?: boolean;
  /** Set the batchSize for the getMoreCommand when iterating over the query results. */
  batchSize?: number;
  /** If true, returns only the index keys in the resulting documents. */
  returnKey?: boolean;
  /** The inclusive lower bound for a specific index */
  min?: Document;
  /** The exclusive upper bound for a specific index */
  max?: Document;
  /** Number of milliseconds to wait before aborting the query. */
  maxTimeMS?: number;
  /** The maximum amount of time for the server to wait on new documents to satisfy a tailable cursor query. Requires `tailable` and `awaitData` to be true */
  maxAwaitTimeMS?: number;
  /** The server normally times out idle cursors after an inactivity period (10 minutes) to prevent excess memory use. Set this option to prevent that. */
  noCursorTimeout?: boolean;
  /** Specify collation (MongoDB 3.4 or higher) settings for update operation (see 3.4 documentation for available fields). */
  collation?: CollationOptions;
  /** Allows disk use for blocking sort operations exceeding 100MB memory. (MongoDB 3.2 or higher) */
  allowDiskUse?: boolean;
  /** Determines whether to close the cursor after the first batch. Defaults to false. */
  singleBatch?: boolean;
  /** For queries against a sharded collection, allows the command (or subsequent getMore commands) to return partial results, rather than an error, if one or more queried shards are unavailable. */
  allowPartialResults?: boolean;
  /** Determines whether to return the record identifier for each document. If true, adds a field $recordId to the returned documents. */
  showRecordId?: boolean;
  /** Map of parameter names and values that can be accessed using $$var (requires MongoDB 5.0). */
  let?: Document;
  /**
   * Option to enable an optimized code path for queries looking for a particular range of `ts` values in the oplog. Requires `tailable` to be true.
   * @deprecated Starting from MongoDB 4.4 this flag is not needed and will be ignored.
   */
  oplogReplay?: boolean;
}

export declare type FilterOperations<T> = T extends Record<string, any>
  ? {
      [key in keyof T]?: FilterOperators<T[key]>;
    }
  : FilterOperators<T>;

export declare type BitwiseFilter =
  | number /** numeric bit mask */
  | any /** BinData bit mask */
  | ReadonlyArray<number>;

export declare interface ObjectIdLike {
  id: string | Buffer;
  __id?: string;
  toHexString(): string;
}

export declare type NonObjectIdLikeDocument = {
  [key in keyof ObjectIdLike]?: never;
} & Document;

export declare interface FilterOperators<TValue>
  extends NonObjectIdLikeDocument {
  $eq?: TValue;
  $gt?: TValue;
  $gte?: TValue;
  $in?: ReadonlyArray<TValue>;
  $lt?: TValue;
  $lte?: TValue;
  $ne?: TValue;
  $nin?: ReadonlyArray<TValue>;
  $not?: TValue extends string
    ? FilterOperators<TValue> | RegExp
    : FilterOperators<TValue>;
  /**
   * When `true`, `$exists` matches the documents that contain the field,
   * including documents where the field value is null.
   */
  $exists?: boolean;
  $type?: any; // BSONType | BSONTypeAlias
  $expr?: Record<string, any>;
  $jsonSchema?: Record<string, any>;
  $mod?: TValue extends number ? [number, number] : never;
  $regex?: TValue extends string ? RegExp | string : never; // | BSONRegExp;
  $options?: TValue extends string ? string : never;
  $geoIntersects?: {
    $geometry: Document;
  };
  $geoWithin?: Document;
  $near?: Document;
  $nearSphere?: Document;
  $maxDistance?: number;
  $all?: ReadonlyArray<any>;
  $elemMatch?: Document;
  $size?: TValue extends ReadonlyArray<any> ? number : never;
  $bitsAllClear?: BitwiseFilter;
  $bitsAllSet?: BitwiseFilter;
  $bitsAnyClear?: BitwiseFilter;
  $bitsAnySet?: BitwiseFilter;
  $rand?: Record<string, never>;
}

export declare interface CommandOperationOptions {
  /** @deprecated This option does nothing */
  fullResponse?: boolean;
  /** Specify a read concern and level for the collection. (only MongoDB 3.2 or higher supported) */
  readConcern?: ReadConcernLike;
  /** Collation */
  collation?: CollationOptions;
  maxTimeMS?: number;
  /**
   * Comment to apply to the operation.
   *
   * In server versions pre-4.4, 'comment' must be string.  A server
   * error will be thrown if any other type is provided.
   *
   * In server versions 4.4 and above, 'comment' can be any valid BSON type.
   */
  comment?: unknown;
  /** Should retry failed writes */
  retryWrites?: boolean;
  dbName?: string;
  authdb?: string;
  noResponse?: boolean;
}
export declare interface AggregateOptions extends CommandOperationOptions {
  /** allowDiskUse lets the server know if it can use disk to store temporary results for the aggregation (requires mongodb 2.6 \>). */
  allowDiskUse?: boolean;
  /** The number of documents to return per batch. See [aggregation documentation](https://docs.mongodb.com/manual/reference/command/aggregate). */
  batchSize?: number;
  /** Allow driver to bypass schema validation in MongoDB 3.2 or higher. */
  bypassDocumentValidation?: boolean;
  /** Return the query as cursor, on 2.6 \> it returns as a real cursor on pre 2.6 it returns as an emulated cursor. */
  cursor?: Document;
  /** specifies a cumulative time limit in milliseconds for processing operations on the cursor. MongoDB interrupts the operation at the earliest following interrupt point. */
  maxTimeMS?: number;
  /** The maximum amount of time for the server to wait on new documents to satisfy a tailable cursor query. */
  maxAwaitTimeMS?: number;
  /** Specify collation. */
  collation?: CollationOptions;
  /** Add an index selection hint to an aggregation command */
  hint?: Hint;
  /** Map of parameter names and values that can be accessed using $$var (requires MongoDB 5.0). */
  let?: Document;
  out?: string;
}

export declare class AggregationCursor<TSchema = any> {
  /* Excluded from this release type: [kPipeline] */
  /* Excluded from this release type: [kOptions] */
  /* Excluded from this release type: __constructor */
  get pipeline(): Document[];
  clone(): AggregationCursor<TSchema>;
  map<T>(transform: (doc: TSchema) => T): AggregationCursor<T>;
  /* Excluded from this release type: _initialize */
  /** Execute the explain for the cursor */
  explain(): Promise<Document>;
  explain(verbosity: any): Promise<Document>;
  /** @deprecated Callbacks are deprecated and will be removed in the next major version. See [mongodb-legacy](https://github.com/mongodb-js/nodejs-mongodb-legacy) for migration assistance */
  explain(callback: any): void;
  /** Add a group stage to the aggregation pipeline */
  group<T = TSchema>($group: Document): AggregationCursor<T>;
  /** Add a limit stage to the aggregation pipeline */
  limit($limit: number): this;
  /** Add a match stage to the aggregation pipeline */
  match($match: Document): this;
  /** Add an out stage to the aggregation pipeline */
  out(
    $out:
      | {
          db: string;
          coll: string;
        }
      | string
  ): this;
  /**
   * Add a project stage to the aggregation pipeline
   *
   * @remarks
   * In order to strictly type this function you must provide an interface
   * that represents the effect of your projection on the result documents.
   *
   * By default chaining a projection to your cursor changes the returned type to the generic {@link Document} type.
   * You should specify a parameterized type to have assertions on your final results.
   *
   * @example
   * ```typescript
   * // Best way
   * const docs: AggregationCursor<{ a: number }> = cursor.project<{ a: number }>({ _id: 0, a: true });
   * // Flexible way
   * const docs: AggregationCursor<Document> = cursor.project({ _id: 0, a: true });
   * ```
   *
   * @remarks
   * In order to strictly type this function you must provide an interface
   * that represents the effect of your projection on the result documents.
   *
   * **Note for Typescript Users:** adding a transform changes the return type of the iteration of this cursor,
   * it **does not** return a new instance of a cursor. This means when calling project,
   * you should always assign the result to a new variable in order to get a correctly typed cursor variable.
   * Take note of the following example:
   *
   * @example
   * ```typescript
   * const cursor: AggregationCursor<{ a: number; b: string }> = coll.aggregate([]);
   * const projectCursor = cursor.project<{ a: number }>({ _id: 0, a: true });
   * const aPropOnlyArray: {a: number}[] = await projectCursor.toArray();
   *
   * // or always use chaining and save the final cursor
   *
   * const cursor = coll.aggregate().project<{ a: string }>({
   *   _id: 0,
   *   a: { $convert: { input: '$a', to: 'string' }
   * }});
   * ```
   */
  project<T extends Document = Document>(
    $project: Document
  ): AggregationCursor<T>;
  /** Add a lookup stage to the aggregation pipeline */
  lookup($lookup: Document): this;
  /** Add a redact stage to the aggregation pipeline */
  redact($redact: Document): this;
  /** Add a skip stage to the aggregation pipeline */
  skip($skip: number): this;
  /** Add a sort stage to the aggregation pipeline */
  sort($sort: Sort): this;
  /** Add a unwind stage to the aggregation pipeline */
  unwind($unwind: Document | string): this;
  /** Add a geoNear stage to the aggregation pipeline */
  geoNear($geoNear: Document): this;
}
