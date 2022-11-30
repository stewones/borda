/* eslint-disable @typescript-eslint/no-explicit-any */

import { ElegClient } from './ElegClient';
import { ElegError, ErrorCode } from './ElegError';
import { log } from './utils';
import { fetch } from './fetch';
import { InternalFieldName } from './internal';

export declare interface Document {
  [key: string]: any; // user defined
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

export declare type QueryMethod =
  | 'find'
  | 'findOne'
  | 'findOneAndDelete'
  | 'findOneAndReplace'
  | 'findOneAndUpdate'
  | 'count';

export declare interface Query<TSchema = Document> {
  params: { [key: string]: any };
  /**
   * api
   */
  collection(name: string): Query<TSchema>;
  projection(
    doc: Partial<{
      [key in keyof TSchema]: number;
    }>
  ): Query<TSchema>;
  sort(sort: Sort): Query<TSchema>;
  filter(by: FilterOperations<TSchema>): Query<TSchema>;
  limit(by: number): Query<TSchema>;
  skip(by: number): Query<TSchema>;
  join(pointers: string[]): Query<TSchema>;

  /**
   * methods
   */
  find(options?: FindOptions): Promise<TSchema[] | void>;
  findOne(options?: FindOptions): Promise<TSchema | void>;
  count(options?: FindOptions): Promise<number | void>;
  execute(
    method: QueryMethod,
    options?: FindOptions
  ): Promise<number | TSchema | TSchema[] | void>;
}

export interface DocumentQuery<T = Document> {
  filter: FilterOperations<T> | undefined;
  limit: number | undefined;
  skip: number | undefined;
  sort: Sort | undefined;
  projection: T | undefined;
  method: QueryMethod | null;
  options: FindOptions | undefined;
  join: string[];
}

export function query<TSchema extends Document>() {
  const bridge: Query<TSchema> = {
    params: {
      join: [],
    },

    collection: (name: string) => {
      bridge.params['collection'] = name;
      return bridge;
    },

    projection: (project) => {
      /**
       * applies a little hack to make sure the projection
       * also works with pointers. ie: _p_fieldName
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

    sort: (sort) => {
      bridge.params['sort'] = sort;
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

    join: (pointers) => {
      bridge.params['join'] = pointers;
      return bridge;
    },

    /**
     * methods
     */
    find: (options) => {
      return bridge.execute('find', options) as Promise<TSchema[] | void>;
    },

    findOne: (options) => {
      return bridge.execute('findOne', options) as Promise<TSchema>;
    },

    count: (options) => {
      return bridge.execute('count', options) as Promise<number>;
    },

    execute: (method, options) => {
      log(method, bridge.params, options);

      if (!ElegClient.params.serverURL) {
        throw new ElegError(
          ErrorCode.SERVER_URL_UNDEFINED,
          'serverURL is not defined on client'
        );
      }

      const { filter, limit, skip, sort, projection, join } = bridge.params;

      const body: DocumentQuery<TSchema> = {
        method,
        options,
        filter,
        projection,
        sort,
        limit,
        skip,
        join,
      };

      const headers = {
        [`${ElegClient.params.serverHeaderPrefix}-Api-Key`]:
          ElegClient.params.apiKey,
      };

      return fetch(
        `${ElegClient.params.serverURL}/${bridge.params['collection']}`,
        {
          method: 'POST',
          headers,
          body,
        }
      );
    },
  };
  return bridge;
}
