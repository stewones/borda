/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

import { Observable } from 'rxjs';

import { LiveQueryMessage } from './livequery';

/* eslint-disable @typescript-eslint/no-explicit-any */
export declare interface Document {
  [key: string]: any;
}

export type DocumentResponse<T extends Document> = number | void | T | T[];
export type DocumentOptions =
  | {
      context?: Record<string, any>;
    }
  | (FindOptions & {
      context?: Record<string, any>;
    })
  | (AggregateOptions & {
      context?: Record<string, any>;
    })
  | (ManyInsertOptions & {
      context?: Record<string, any>;
    });

/**
 * learn more
 * https://www.mongodb.com/docs/manual/reference/change-events/
 */
export type DocumentEvent =
  | 'insert'
  | 'update'
  | 'delete'
  | 'replace'
  | 'invalidate'
  | 'create'
  | 'createIndexes'
  | 'drop'
  | 'dropDatabase'
  | 'dropIndexes'
  | 'modify'
  | 'rename'
  | 'shardCollection';

export interface DocumentQuery<TSchema = Document> {
  filter?: DocumentFilter<TSchema>;
  limit?: number;
  skip?: number;
  sort?: Sort;
  projection?: Partial<{
    [key in keyof TSchema]: number;
  }>;
  options?: DocumentOptions;
  pipeline?: DocumentPipeline<TSchema>;
  include?: string[];
  exclude?: string[];
  doc?: Document | null;
  docs?: Document[] | null;
  collection: string;
}

export type DocumentRootFilter<TSchema = Document> =
  RootFilterOperators<TSchema> & { $expr?: Record<string, any> };

export type DocumentPipe<TSchema = Document> =
  | { $explain: ExplainVerbosityLike }
  | { $group: Document }
  | { $limit: number }
  | {
      $match:
        | Partial<{
            [key in keyof TSchema]:
              | TSchema[key]
              | FilterOperators<TSchema[key]>;
          }>
        | DocumentRootFilter<TSchema>;
    }
  | { $out: string | { db: string; coll: string } }
  | {
      $project: Document;
    }
  | { $lookup: Document }
  | { $redact: Document }
  | { $skip: number }
  | { $sort: Sort }
  | { $unwind: string | Document }
  | { $unset: string | Document | Document[] }
  | { $geoNear: Document }
  | { $addFields: Document };

export type DocumentPipeline<TSchema = Document> = DocumentPipe<TSchema>[];

export type DocumentFilter<TSchema = Document> = Partial<{
  [key in keyof TSchema]: TSchema[key] | FilterOperators<TSchema[key]>;
}> &
  DocumentRootFilter<TSchema>;

export declare type QueryMethod =
  /**
   * data retrieval
   */
  | 'find'
  | 'findOne'
  | 'get'
  | 'aggregate'
  | 'count'

  /**
   * data mutation
   */
  | 'insert'
  | 'insertMany'
  | 'update'
  | 'put'
  | 'remove'
  | 'delete'

  /**
   * user specifics related
   */
  | 'signUp'
  | 'signIn';

export interface QRLParams<TSchema extends Document = Document> {
  collection: string;
  filter?: DocumentFilter<TSchema>;
  pipeline?: DocumentPipeline<TSchema>;
  projection?: Partial<{
    [key in keyof TSchema]: number;
  }>;
  sort?: Sort;
  limit?: number;
  skip?: number;
  include?: string[];
  exclude?: string[];
  unlock?: boolean;
}
export declare interface Query<TSchema extends Document = Document> {
  params: QRLParams<TSchema>;
  options: FindOptions;

  /**
   * the unlock method is meant to make operations without restrictions.
   * make sure to only use this when running on server and *never expose your api secret*.
   */
  unlock(isUnlocked?: boolean): Query<TSchema>;

  /**
   * project 1st level fields for this query
   */
  projection(doc: Partial<Projection<TSchema>>): Query<TSchema>;

  /**
   * sort documents
   */
  sort(by: Sort): Query<TSchema>;

  /**
   * filter documents unsing mogo-like syntax
   */
  filter(by: DocumentFilter<TSchema>): Query<TSchema>;

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
  pipeline(docs: DocumentPipeline<TSchema>): Query<TSchema>;

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
  find(
    options?: FindOptions & { context?: Record<string, any> }
  ): Promise<TSchema[]>;

  /**
   * find a document using mongo-like queries
   * or direclty by passing its objectId
   */
  findOne(objectId: string): Promise<TSchema>;
  findOne(
    objectId: string,
    options?: FindOptions & {
      context?: Record<string, any>;
    }
  ): Promise<TSchema>;
  findOne(options?: { context?: Record<string, any> }): Promise<TSchema>;

  /**
   * update a document using mongo-like queries
   * or direclty by passing its objectId
   */
  update(
    doc: TSchema,
    options?: {
      context?: Record<string, any>;
    }
  ): Promise<void>;
  update(
    objectId: string,
    doc: TSchema,
    options?: {
      context?: Record<string, any>;
    }
  ): Promise<void>;

  /**
   * insert a document
   */
  insert(
    doc: Partial<TSchema>,
    options?: {
      context?: Record<string, any>;
    }
  ): Promise<TSchema>;

  /**
   * insert many documents
   * The number of operations in each group cannot exceed the value of the maxWriteBatchSize of the database. As of MongoDB 3.6, this value is 100,000.
   * learn more https://www.mongodb.com/docs/manual/reference/method/db.collection.insertMany/
   */
  insertMany(
    docs: Partial<TSchema[]>,
    options?: ManyInsertOptions<TSchema>
  ): Promise<ManyInsertResponse<TSchema>>;

  /**
   * delete a document using mongo-like queries
   * or direclty by passing its objectId
   */
  delete(options?: { context?: Record<string, any> }): Promise<void>;
  delete(
    objectId: string,
    options?: {
      context?: Record<string, any>;
    }
  ): Promise<void>;

  /**
   * count documents using mongo-like queries
   */
  count(
    options?: FindOptions & {
      context?: Record<string, any>;
    }
  ): Promise<number>;

  /**
   * aggregate documents using mongo-like queries
   */
  aggregate(
    options?: AggregateOptions & {
      context?: Record<string, any>;
    }
  ): Promise<TSchema[]>;

  /**
   * run mongo query methods
   */
  run(
    method: QueryMethod,
    options?: DocumentOptions,
    docOrDocs?: Partial<TSchema | TSchema[]>,
    objectId?: string
  ): Promise<number | TSchema | TSchema[] | ManyInsertResponse<TSchema> | void>;

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

export type Projection<TSchema extends Document = Document> = {
  [key in keyof TSchema]:
    | number
    | Partial<{ [key in keyof TSchema]: number }>
    | Projection<TSchema[key][key]>;
};

export interface ManyInsertResponse<TSchema> {
  /** Indicates whether this write result was acknowledged. If not, then all other members of this result will be undefined */
  acknowledged: boolean;
  /** The number of inserted documents for this operations */
  insertedCount: number;
  /** Map of the index of the inserted document to the id of the inserted document */
  insertedIds: {
    [key: number]: InferIdType<TSchema>;
  };
}

export interface ManyInsertOptions<TSchema extends Document = Document> {
  writeConcern: TSchema;
  ordered: boolean;
}

export declare type ResumeToken = unknown;
export declare type OperationTime = Timestamp;
export declare type Join<T extends unknown[], D extends string> = T extends []
  ? ''
  : T extends [string | number]
  ? `${T[0]}`
  : T extends [string | number, ...infer R]
  ? `${T[0]}${D}${Join<R, D>}`
  : string;
export declare type NestedPaths<
  Type,
  Depth extends number[]
> = Depth['length'] extends 8
  ? []
  : Type extends
      | string
      | number
      | boolean
      | Date
      | RegExp
      | Buffer
      | Uint8Array
      | ((...args: any[]) => any)
      | {
          _bsontype: string;
        }
  ? []
  : Type extends ReadonlyArray<infer ArrayType>
  ? [] | [number, ...NestedPaths<ArrayType, [...Depth, 1]>]
  : Type extends Map<string, any>
  ? [string]
  : Type extends object
  ? {
      [Key in Extract<keyof Type, string>]: Type[Key] extends Type
        ? [Key]
        : Type extends Type[Key]
        ? [Key]
        : Type[Key] extends ReadonlyArray<infer ArrayType>
        ? Type extends ArrayType
          ? [Key]
          : ArrayType extends Type
          ? [Key]
          : [Key, ...NestedPaths<Type[Key], [...Depth, 1]>] // child is not structured the same as the parent
        : [Key, ...NestedPaths<Type[Key], [...Depth, 1]>] | [Key];
    }[Extract<keyof Type, string>]
  : [];
export type ObjectId = any;
export declare type EnhancedOmit<TRecordOrUnion, KeyUnion> =
  string extends keyof TRecordOrUnion
    ? TRecordOrUnion
    : TRecordOrUnion extends any
    ? Pick<TRecordOrUnion, Exclude<keyof TRecordOrUnion, KeyUnion>>
    : never;
export declare type InferIdType<TSchema> = TSchema extends {
  _id: infer IdType;
}
  ? Record<any, never> extends IdType
    ? never
    : IdType
  : TSchema extends {
      _id?: infer IdType;
    }
  ? unknown extends IdType
    ? ObjectId
    : IdType
  : ObjectId;

export declare type WithId<TSchema> = EnhancedOmit<TSchema, '_id'> & {
  _id: InferIdType<TSchema>;
};

export declare type RegExpOrString<T> = T extends string ? any | RegExp | T : T;

/**
 * It is possible to search using alternative types in mongodb e.g.
 * string types can be searched using a regex in mongo
 * array types can be searched using their element type
 * @public
 */
export declare type AlternativeType<T> = T extends ReadonlyArray<infer U>
  ? T | RegExpOrString<U>
  : RegExpOrString<T>;

/** @public */
export declare type Condition<T> =
  | AlternativeType<T>
  | FilterOperators<AlternativeType<T>>;

/** @public */
export declare type PropertyType<
  Type,
  Property extends string
> = string extends Property
  ? unknown
  : Property extends keyof Type
  ? Type[Property]
  : Property extends `${number}`
  ? Type extends ReadonlyArray<infer ArrayType>
    ? ArrayType
    : unknown
  : Property extends `${infer Key}.${infer Rest}`
  ? Key extends `${number}`
    ? Type extends ReadonlyArray<infer ArrayType>
      ? PropertyType<ArrayType, Rest>
      : unknown
    : Key extends keyof Type
    ? Type[Key] extends Map<string, infer MapType>
      ? MapType
      : PropertyType<Type[Key], Rest>
    : unknown
  : unknown;
/** @public */
export declare interface RootFilterOperators<TSchema> extends Document {
  $and?: Filter<TSchema>[];
  $nor?: Filter<TSchema>[];
  $or?: Filter<TSchema>[];
  $text?: {
    $search: string;
    $language?: string;
    $caseSensitive?: boolean;
    $diacriticSensitive?: boolean;
  };
  $where?: string | ((this: TSchema) => boolean);
  $comment?: string | Document;
}

export declare const ExplainVerbosity: Readonly<{
  readonly queryPlanner: 'queryPlanner';
  readonly queryPlannerExtended: 'queryPlannerExtended';
  readonly executionStats: 'executionStats';
  readonly allPlansExecution: 'allPlansExecution';
}>;

/** @public */
export declare type ExplainVerbosity = string;

/**
 * For backwards compatibility, true is interpreted as "allPlansExecution"
 * and false as "queryPlanner". Prior to server version 3.6, aggregate()
 * ignores the verbosity parameter and executes in "queryPlanner".
 * @public
 */
export declare type ExplainVerbosityLike = ExplainVerbosity | boolean;

export declare type Filter<TSchema> =
  | Partial<TSchema>
  | ({
      [Property in Join<NestedPaths<WithId<TSchema>, []>, '.'>]?: Condition<
        PropertyType<WithId<TSchema>, Property>
      >;
    } & RootFilterOperators<WithId<TSchema>>);

export declare class Long {
  _bsontype: 'Long';
  /** An indicator used to reliably determine if an object is a Long or not. */
  __isLong__: true;
  /**
   * The high 32 bits as a signed value.
   */
  high: number;
  /**
   * The low 32 bits as a signed value.
   */
  low: number;
  /**
   * Whether unsigned or not.
   */
  unsigned: boolean;
  /**
   * Constructs a 64 bit two's-complement integer, given its low and high 32 bit values as *signed* integers.
   *  See the from* functions below for more convenient ways of constructing Longs.
   *
   * Acceptable signatures are:
   * - Long(low, high, unsigned?)
   * - Long(bigint, unsigned?)
   * - Long(string, unsigned?)
   *
   * @param low - The low (signed) 32 bits of the long
   * @param high - The high (signed) 32 bits of the long
   * @param unsigned - Whether unsigned or not, defaults to signed
   */
  constructor(
    low?: number | bigint | string,
    high?: number | boolean,
    unsigned?: boolean
  );
  static TWO_PWR_24: Long;
  /** Maximum unsigned value. */
  static MAX_UNSIGNED_VALUE: Long;
  /** Signed zero */
  static ZERO: Long;
  /** Unsigned zero. */
  static UZERO: Long;
  /** Signed one. */
  static ONE: Long;
  /** Unsigned one. */
  static UONE: Long;
  /** Signed negative one. */
  static NEG_ONE: Long;
  /** Maximum signed value. */
  static MAX_VALUE: Long;
  /** Minimum signed value. */
  static MIN_VALUE: Long;
  /**
   * Returns a Long representing the 64 bit integer that comes by concatenating the given low and high bits.
   * Each is assumed to use 32 bits.
   * @param lowBits - The low 32 bits
   * @param highBits - The high 32 bits
   * @param unsigned - Whether unsigned or not, defaults to signed
   * @returns The corresponding Long value
   */
  static fromBits(lowBits: number, highBits: number, unsigned?: boolean): Long;
  /**
   * Returns a Long representing the given 32 bit integer value.
   * @param value - The 32 bit integer in question
   * @param unsigned - Whether unsigned or not, defaults to signed
   * @returns The corresponding Long value
   */
  static fromInt(value: number, unsigned?: boolean): Long;
  /**
   * Returns a Long representing the given value, provided that it is a finite number. Otherwise, zero is returned.
   * @param value - The number in question
   * @param unsigned - Whether unsigned or not, defaults to signed
   * @returns The corresponding Long value
   */
  static fromNumber(value: number, unsigned?: boolean): Long;
  /**
   * Returns a Long representing the given value, provided that it is a finite number. Otherwise, zero is returned.
   * @param value - The number in question
   * @param unsigned - Whether unsigned or not, defaults to signed
   * @returns The corresponding Long value
   */
  static fromBigInt(value: bigint, unsigned?: boolean): Long;
  /**
   * Returns a Long representation of the given string, written using the specified radix.
   * @param str - The textual representation of the Long
   * @param unsigned - Whether unsigned or not, defaults to signed
   * @param radix - The radix in which the text is written (2-36), defaults to 10
   * @returns The corresponding Long value
   */
  static fromString(str: string, unsigned?: boolean, radix?: number): Long;
  /**
   * Creates a Long from its byte representation.
   * @param bytes - Byte representation
   * @param unsigned - Whether unsigned or not, defaults to signed
   * @param le - Whether little or big endian, defaults to big endian
   * @returns The corresponding Long value
   */
  static fromBytes(bytes: number[], unsigned?: boolean, le?: boolean): Long;
  /**
   * Creates a Long from its little endian byte representation.
   * @param bytes - Little endian byte representation
   * @param unsigned - Whether unsigned or not, defaults to signed
   * @returns The corresponding Long value
   */
  static fromBytesLE(bytes: number[], unsigned?: boolean): Long;
  /**
   * Creates a Long from its big endian byte representation.
   * @param bytes - Big endian byte representation
   * @param unsigned - Whether unsigned or not, defaults to signed
   * @returns The corresponding Long value
   */
  static fromBytesBE(bytes: number[], unsigned?: boolean): Long;
  /**
   * Tests if the specified object is a Long.
   */
  static isLong(value: unknown): value is Long;
  /**
   * Converts the specified value to a Long.
   * @param unsigned - Whether unsigned or not, defaults to signed
   */
  static fromValue(
    val:
      | number
      | string
      | {
          low: number;
          high: number;
          unsigned?: boolean;
        },
    unsigned?: boolean
  ): Long;
  /** Returns the sum of this and the specified Long. */
  add(addend: string | number | Long | Timestamp): Long;
  /**
   * Returns the sum of this and the specified Long.
   * @returns Sum
   */
  and(other: string | number | Long | Timestamp): Long;
  /**
   * Compares this Long's value with the specified's.
   * @returns 0 if they are the same, 1 if the this is greater and -1 if the given one is greater
   */
  compare(other: string | number | Long | Timestamp): 0 | 1 | -1;
  /** This is an alias of {@link Long.compare} */
  comp(other: string | number | Long | Timestamp): 0 | 1 | -1;
  /**
   * Returns this Long divided by the specified. The result is signed if this Long is signed or unsigned if this Long is unsigned.
   * @returns Quotient
   */
  divide(divisor: string | number | Long | Timestamp): Long;
  /**This is an alias of {@link Long.divide} */
  div(divisor: string | number | Long | Timestamp): Long;
  /**
   * Tests if this Long's value equals the specified's.
   * @param other - Other value
   */
  equals(other: string | number | Long | Timestamp): boolean;
  /** This is an alias of {@link Long.equals} */
  eq(other: string | number | Long | Timestamp): boolean;
  /** Gets the high 32 bits as a signed integer. */
  getHighBits(): number;
  /** Gets the high 32 bits as an unsigned integer. */
  getHighBitsUnsigned(): number;
  /** Gets the low 32 bits as a signed integer. */
  getLowBits(): number;
  /** Gets the low 32 bits as an unsigned integer. */
  getLowBitsUnsigned(): number;
  /** Gets the number of bits needed to represent the absolute value of this Long. */
  getNumBitsAbs(): number;
  /** Tests if this Long's value is greater than the specified's. */
  greaterThan(other: string | number | Long | Timestamp): boolean;
  /** This is an alias of {@link Long.greaterThan} */
  gt(other: string | number | Long | Timestamp): boolean;
  /** Tests if this Long's value is greater than or equal the specified's. */
  greaterThanOrEqual(other: string | number | Long | Timestamp): boolean;
  /** This is an alias of {@link Long.greaterThanOrEqual} */
  gte(other: string | number | Long | Timestamp): boolean;
  /** This is an alias of {@link Long.greaterThanOrEqual} */
  ge(other: string | number | Long | Timestamp): boolean;
  /** Tests if this Long's value is even. */
  isEven(): boolean;
  /** Tests if this Long's value is negative. */
  isNegative(): boolean;
  /** Tests if this Long's value is odd. */
  isOdd(): boolean;
  /** Tests if this Long's value is positive. */
  isPositive(): boolean;
  /** Tests if this Long's value equals zero. */
  isZero(): boolean;
  /** Tests if this Long's value is less than the specified's. */
  lessThan(other: string | number | Long | Timestamp): boolean;
  /** This is an alias of {@link Long#lessThan}. */
  lt(other: string | number | Long | Timestamp): boolean;
  /** Tests if this Long's value is less than or equal the specified's. */
  lessThanOrEqual(other: string | number | Long | Timestamp): boolean;
  /** This is an alias of {@link Long.lessThanOrEqual} */
  lte(other: string | number | Long | Timestamp): boolean;
  /** Returns this Long modulo the specified. */
  modulo(divisor: string | number | Long | Timestamp): Long;
  /** This is an alias of {@link Long.modulo} */
  mod(divisor: string | number | Long | Timestamp): Long;
  /** This is an alias of {@link Long.modulo} */
  rem(divisor: string | number | Long | Timestamp): Long;
  /**
   * Returns the product of this and the specified Long.
   * @param multiplier - Multiplier
   * @returns Product
   */
  multiply(multiplier: string | number | Long | Timestamp): Long;
  /** This is an alias of {@link Long.multiply} */
  mul(multiplier: string | number | Long | Timestamp): Long;
  /** Returns the Negation of this Long's value. */
  negate(): Long;
  /** This is an alias of {@link Long.negate} */
  neg(): Long;
  /** Returns the bitwise NOT of this Long. */
  not(): Long;
  /** Tests if this Long's value differs from the specified's. */
  notEquals(other: string | number | Long | Timestamp): boolean;
  /** This is an alias of {@link Long.notEquals} */
  neq(other: string | number | Long | Timestamp): boolean;
  /** This is an alias of {@link Long.notEquals} */
  ne(other: string | number | Long | Timestamp): boolean;
  /**
   * Returns the bitwise OR of this Long and the specified.
   */
  or(other: number | string | Long): Long;
  /**
   * Returns this Long with bits shifted to the left by the given amount.
   * @param numBits - Number of bits
   * @returns Shifted Long
   */
  shiftLeft(numBits: number | Long): Long;
  /** This is an alias of {@link Long.shiftLeft} */
  shl(numBits: number | Long): Long;
  /**
   * Returns this Long with bits arithmetically shifted to the right by the given amount.
   * @param numBits - Number of bits
   * @returns Shifted Long
   */
  shiftRight(numBits: number | Long): Long;
  /** This is an alias of {@link Long.shiftRight} */
  shr(numBits: number | Long): Long;
  /**
   * Returns this Long with bits logically shifted to the right by the given amount.
   * @param numBits - Number of bits
   * @returns Shifted Long
   */
  shiftRightUnsigned(numBits: Long | number): Long;
  /** This is an alias of {@link Long.shiftRightUnsigned} */
  shr_u(numBits: number | Long): Long;
  /** This is an alias of {@link Long.shiftRightUnsigned} */
  shru(numBits: number | Long): Long;
  /**
   * Returns the difference of this and the specified Long.
   * @param subtrahend - Subtrahend
   * @returns Difference
   */
  subtract(subtrahend: string | number | Long | Timestamp): Long;
  /** This is an alias of {@link Long.subtract} */
  sub(subtrahend: string | number | Long | Timestamp): Long;
  /** Converts the Long to a 32 bit integer, assuming it is a 32 bit integer. */
  toInt(): number;
  /** Converts the Long to a the nearest floating-point representation of this value (double, 53 bit mantissa). */
  toNumber(): number;
  /** Converts the Long to a BigInt (arbitrary precision). */
  toBigInt(): bigint;
  /**
   * Converts this Long to its byte representation.
   * @param le - Whether little or big endian, defaults to big endian
   * @returns Byte representation
   */
  toBytes(le?: boolean): number[];
  /**
   * Converts this Long to its little endian byte representation.
   * @returns Little endian byte representation
   */
  toBytesLE(): number[];
  /**
   * Converts this Long to its big endian byte representation.
   * @returns Big endian byte representation
   */
  toBytesBE(): number[];
  /**
   * Converts this Long to signed.
   */
  toSigned(): Long;
  /**
   * Converts the Long to a string written in the specified radix.
   * @param radix - Radix (2-36), defaults to 10
   * @throws RangeError If `radix` is out of range
   */
  toString(radix?: number): string;
  /** Converts this Long to unsigned. */
  toUnsigned(): Long;
  /** Returns the bitwise XOR of this Long and the given one. */
  xor(other: Long | number | string): Long;
  /** This is an alias of {@link Long.isZero} */
  eqz(): boolean;
  /** This is an alias of {@link Long.lessThanOrEqual} */
  le(other: string | number | Long | Timestamp): boolean;
  toExtendedJSON(options: any): number | LongExtended;
  static fromExtendedJSON(
    doc: {
      $numberLong: string;
    },
    options?: any
  ): number | Long;
  inspect(): string;
}

/** @public */
export declare interface LongExtended {
  $numberLong: string;
}

export declare class Timestamp {
  _bsontype: 'Timestamp';
  static readonly MAX_VALUE: Long;
  /**
   * @param low - A 64-bit Long representing the Timestamp.
   */
  constructor(long: Long);
  /**
   * @param value - A pair of two values indicating timestamp and increment.
   */
  constructor(value: { t: number; i: number });
  /**
   * @param low - the low (signed) 32 bits of the Timestamp.
   * @param high - the high (signed) 32 bits of the Timestamp.
   * @deprecated Please use `Timestamp({ t: high, i: low })` or `Timestamp(Long(low, high))` instead.
   */
  constructor(low: number, high: number);
  toJSON(): {
    $timestamp: string;
  };
  /** Returns a Timestamp represented by the given (32-bit) integer value. */
  static fromInt(value: number): Timestamp;
  /** Returns a Timestamp representing the given number value, provided that it is a finite number. Otherwise, zero is returned. */
  static fromNumber(value: number): Timestamp;
  /**
   * Returns a Timestamp for the given high and low bits. Each is assumed to use 32 bits.
   *
   * @param lowBits - the low 32-bits.
   * @param highBits - the high 32-bits.
   */
  static fromBits(lowBits: number, highBits: number): Timestamp;
  /**
   * Returns a Timestamp from the given string, optionally using the given radix.
   *
   * @param str - the textual representation of the Timestamp.
   * @param optRadix - the radix in which the text is written.
   */
  static fromString(str: string, optRadix: number): Timestamp;
  /* Excluded from this release type: toExtendedJSON */
  /* Excluded from this release type: fromExtendedJSON */
  inspect(): string;
}
export declare interface ChangeStreamOptions extends AggregateOptions {
  /**
   * Allowed values: 'updateLookup', 'whenAvailable', 'required'.
   *
   * When set to 'updateLookup', the change notification for partial updates
   * will include both a delta describing the changes to the document as well
   * as a copy of the entire document that was changed from some time after
   * the change occurred.
   *
   * When set to 'whenAvailable', configures the change stream to return the
   * post-image of the modified document for replace and update change events
   * if the post-image for this event is available.
   *
   * When set to 'required', the same behavior as 'whenAvailable' except that
   * an error is raised if the post-image is not available.
   */
  fullDocument?: string;
  /**
   * Allowed values: 'whenAvailable', 'required', 'off'.
   *
   * The default is to not send a value, which is equivalent to 'off'.
   *
   * When set to 'whenAvailable', configures the change stream to return the
   * pre-image of the modified document for replace, update, and delete change
   * events if it is available.
   *
   * When set to 'required', the same behavior as 'whenAvailable' except that
   * an error is raised if the pre-image is not available.
   */
  fullDocumentBeforeChange?: string;
  /** The maximum amount of time for the server to wait on new documents to satisfy a change stream query. */
  maxAwaitTimeMS?: number;
  /**
   * Allows you to start a changeStream after a specified event.
   * @see https://docs.mongodb.com/manual/changeStreams/#resumeafter-for-change-streams
   */
  resumeAfter?: ResumeToken;
  /**
   * Similar to resumeAfter, but will allow you to start after an invalidated event.
   * @see https://docs.mongodb.com/manual/changeStreams/#startafter-for-change-streams
   */
  startAfter?: ResumeToken;
  /** Will start the changeStream after the specified operationTime. */
  startAtOperationTime?: OperationTime;
  /**
   * The number of documents to return per batch.
   * @see https://docs.mongodb.com/manual/reference/command/aggregate
   */
  batchSize?: number;
  /**
   * When enabled, configures the change stream to include extra change events.
   *
   * - createIndexes
   * - dropIndexes
   * - modify
   * - create
   * - shardCollection
   * - reshardCollection
   * - refineCollectionShardKey
   */
  showExpandedEvents?: boolean;
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
  $in?: TValue | ReadonlyArray<TValue>;
  $lt?: TValue;
  $lte?: TValue;
  $ne?: TValue;
  $nin?: TValue | ReadonlyArray<TValue>;
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
