/* eslint-disable @typescript-eslint/no-explicit-any */

import { Binary, BSONRegExp, BSONType, BSONTypeAlias } from './utils/bson';

export declare interface Document {
  [key: string]: any;
}
export declare interface ObjectIdLike {
  id: string | Buffer;
  __id?: string;
  toHexString(): string;
}

export declare type NonObjectIdLikeDocument = {
  [key in keyof ObjectIdLike]?: never;
} & Document;

export declare type BitwiseFilter =
  | number /** numeric bit mask */
  | Binary /** BinData bit mask */
  | ReadonlyArray<number>;

export declare type FilterOperations<T> = T extends Record<string, any>
  ? {
      [key in keyof T]?: FilterOperators<T[key]>;
    }
  : FilterOperators<T>;

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
  $type?: BSONType | BSONTypeAlias;
  $expr?: Record<string, any>;
  $jsonSchema?: Record<string, any>;
  $mod?: TValue extends number ? [number, number] : never;
  $regex?: TValue extends string ? RegExp | BSONRegExp | string : never;
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
