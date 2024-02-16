/**
 * @license
 * Copyright Borda All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://borda.dev/license
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  Collection,
  Db,
  Document,
} from 'mongodb';

import {
  BordaError,
  DocumentLiveQuery,
  DocumentQuery,
  ErrorCode,
  ExternalFieldName,
  InternalCollectionName,
  InternalFieldName,
  InternalSensitiveFields,
  isArrayPointer,
  isEmpty,
  isISODate,
  isNumber,
  isPointer,
  isServer,
  pointerObjectFrom,
  Projection,
  removeUndefinedProperties,
} from '@borda/client';

import { Cache } from './Cache';
import { BordaServerQuery } from './query';

export interface DocQRL<T extends Document = Document> extends DocumentQuery<T> {
  collection$: Collection<T>;
  doc: T;
  docs: T[];
}

export type DocQRLFrom = DocumentQuery | DocumentLiveQuery | Document;

export function parseDoc<TSchema = Document>({
  obj,
  inspect,
  isUnlocked,
  cache,
  query,
}: {
  obj: any;
  inspect: boolean;
  isUnlocked: boolean;
  cache: Cache;
  query: (collection: string) => BordaServerQuery;
}): (docQuery: Omit<DocumentQuery, 'method'>) => Promise<TSchema> {
  return async (docQuery) => {
    await parseInclude({
      obj,
      inspect,
      cache,
      query,
    })(docQuery).catch((err) => {
      throw new BordaError(ErrorCode.QUERY_INCLUDE_ERROR, err.message || err);
    });
    await parseExclude({
      obj,
      inspect,
    })(docQuery).catch((err) => {
      throw new BordaError(ErrorCode.QUERY_EXCLUDE_ERROR, err.message || err);
    });

    return Promise.resolve(
      parseResponse(obj, {
        removeSensitiveFields: !isUnlocked,
      })
    );
  };
}

export function parseDocs<T extends Document[]>({
  arr,
  inspect,
  isUnlocked,
  cache,
  query,
}: {
  arr: any[];
  inspect: boolean;
  isUnlocked: boolean;
  cache: Cache;
  query: (collection: string) => BordaServerQuery;
}): (docQuery: Omit<DocumentQuery, 'method'>) => Promise<T[]> {
  return async (docQuery) => {
    for (let item of arr) {
      item = await parseDoc({
        obj: item,
        inspect,
        isUnlocked,
        cache,
        query,
      })(docQuery);
    }
    return Promise.resolve(arr as T[]);
  };
}

export function parseDocForInsertion(obj: any): any {
  try {
    /**
     * format external keys recursevely
     */
    if (Array.isArray(obj) && obj.every((item) => typeof item === 'object')) {
      for (let i = 0; i < obj.length; i++) {
        obj[i] = parseDocForInsertion(obj[i]);
      }
    }

    if (!Array.isArray(obj) && typeof obj === 'object') {
      for (let field in obj) {
        // console.log('field', field, 'obj[field]', obj[field]);

        if (InternalFieldName[field]) {
          obj[InternalFieldName[field]] = obj[field];
          delete obj[field];
          field = InternalFieldName[field];
        }

        if (isISODate(obj[field])) {
          obj[field] = new Date(obj[field]);
        }

        if (!field.startsWith('_p_') && isPointer(obj[field])) {
          const newField = `_p_${field}`;
          obj[newField] = obj[field];
          delete obj[field];
          field = newField;
        }

        if (typeof obj[field] === 'object') {
          parseDocForInsertion(obj[field]);
        }
      }
    }

    return obj;
  } catch (err: any) {
    throw err.toString();
  }
}

export function parseExclude<T = Document>({
  obj,
  inspect,
}: {
  obj: any;
  inspect: boolean;
}): (docQuery: Omit<DocumentQuery<T>, 'method'>) => Promise<T> {
  return async (docQuery) => {
    const { exclude } = docQuery;

    /**
     * create a tree structure out of exclude
     * to delete the fields in the following format
     *
     * ie:
     * ['a', 'b', 'b.c', 'b.a', 'x.y.z']
     *
     * becomes:
     * {
     *    a: [],
     *    b: ['c', 'a'],
     *    x: ['y.z']
     * }
     *
     * then:
     * a, b, x are the key names
     * while their values are the new exclude paths to be requested for deletion
     */
    const tree = createTree(exclude ?? []);

    if (inspect) {
      console.log('exclude', exclude);
      console.log('tree', tree);
    }

    /**
     * parse tree and delete the last level of keys
     */

    const parse = (obj: any, tree: Record<string, string[]>) => {
      for (const key in tree) {
        const treeValue = tree[key];
        if (treeValue.length) {
          parse(obj[key], createTree(tree[key]));
        } else {
          delete obj[key];
          if (inspect) {
            console.log('excluded', key);
          }
        }
      }
    };

    parse(obj, tree);

    return Promise.resolve(obj);
  };
}

export function parseFilter(obj: any | any[]): any | any[] {
  if (!isServer())
    throw new BordaError(
      ErrorCode.QUERY_FILTER_SERVER_ONLY,
      'we should only parse filters in the server'
    );

  if (Array.isArray(obj) && obj.every((item) => typeof item === 'object')) {
    for (let i = 0; i < obj.length; i++) {
      obj[i] = parseFilter(obj[i]);
    }
  }

  if (!Array.isArray(obj) && typeof obj === 'object') {
    for (let field in obj) {
      const value: any = obj[field];

      /**
       * format internal keys
       * createdAt -> _created_at
       */
      if (InternalFieldName[field]) {
        obj[InternalFieldName[field]] = obj[field];
        delete obj[field];
        field = InternalFieldName[field];
      }

      /**
       * checks if value is a valid iso date
       * and convert to Date as it's required by mongo
       */
      if (typeof value === 'string' && isISODate(value)) {
        obj[field] = new Date(value) as any;
      }

      /**
       * checks for expression cases
       * eg: [ '$someField.someDate', '2024-01-21T20:33:37.302Z' ]       *
       */
      if (Array.isArray(value) && value.length === 2) {
        const [, date] = value;
        if (isISODate(date)) {
          value[1] = new Date(date);
        }
      }

      /**
       * deal with pointers
       * {
       *   fieldName: 'Collection$objectId'
       * }
       */
  
      if (
        field &&
        typeof field === 'string' &&
        !field.startsWith('$') &&
        !field.startsWith('_p_') &&
        !field.includes('.') &&
        isPointer(value)
      ) {
        obj['_p_' + field] = value;
        delete obj[field];
      }

      /**
       * deal with pointers
       * {
       *   fieldName: {
       *     $eq: 'Collection$objectId'
       *   }
       * }
       */
      if (
        field &&
        typeof field === 'string' &&
        !field.startsWith('$') &&
        !field.startsWith('_p_') &&
        typeof value === 'object'
      ) {
        let foundPointer = false;
        for (const operator in value) {
          if (operator.startsWith('$') && isPointer(value[operator])) {
            foundPointer = true;
          }
        }
        if (foundPointer) {
          obj['_p_' + field] = value;
          delete obj[field];
        }
      }

      /**
       * deal with empty $and and $or
       */
      if (['$and', '$or'].includes(field)) {
        if (Array.isArray(value) && !value.length) {
          delete obj[field];
        }
      }

      /**
       *  deal with expiresAt.$exists: -1 (because for some reason serializing false values over the wire is turning into "expiresAt: {}")
       */
      if (field === '$exists' && value === -1) {
        obj[field] = false;
      }

      /**
       * keep parsing
       */
      if (typeof obj[field] === 'object') {
        parseFilter(obj[field]);
      }
    }
  }

  return obj;
}

export function parseInclude<TSchema = Document>({
  obj,
  inspect,
  cache,
  query,
}: {
  obj: any;
  inspect: boolean;
  cache: Cache;
  query: (collection: string) => BordaServerQuery;
}): (docQuery: Omit<DocumentQuery, 'method'>) => Promise<TSchema> {
  return async (docQuery) => {
    if (!obj) return {};
    const { include } = docQuery;
    /**
     * create a tree structure out of include
     * to recursively join the pointers in the following format
     *
     * ie:
     * ['a', 'b', 'b.c', 'b.a', 'x.y.z']
     *
     * becomes:
     * {
     *    a: [],
     *    b: ['c', 'a'],
     *    x: ['y.z']
     * }
     *
     * then:
     * a, b, x becomes the pointer names (which should be mapped to the actual collection)
     * while their values are the new join paths to be requested
     */
    const tree = createTree(include ?? []);

    if (inspect) {
      console.log('tree', tree);
    }

    /**
     * parse tree
     */
    for (const pointerField in tree) {
      const pointerValue = obj[`_p_${pointerField}`] || obj[pointerField];

      if (inspect) {
        console.log('pointerField', pointerField);
        console.log('pointerValue', pointerValue);
        console.log('isPointer', isPointer(pointerValue));
      }

      if (isArrayPointer(pointerValue)) {
        for (let pointer of pointerValue) {
          const index = pointerValue.indexOf(pointer);
          pointer = await parseJoin({
            tree,
            pointerField,
            pointerValue,
            cache,
            query,
          });
          pointerValue[index] = pointer;
        }
        continue;
      }

      if (!isPointer(pointerValue)) {
        continue;
      }

      const doc = await parseJoin({
        tree,
        pointerField,
        pointerValue,
        cache,
        query,
      });

      // replace pointer with the actual document
      obj[pointerField] = doc;

      // remove raw _p_ entry
      delete obj[`_p_${pointerField}`];

      /**
       * this means the object may be populated in the first level
       * but we still need to keep trying to populate the next level
       */
      await parseJoinKeep({
        docQuery,
        obj,
        tree,
        pointerField,
        inspect,
        cache,
        query,
      });
    }
    return Promise.resolve(obj);
  };
}

export async function parseJoin({
  tree,
  pointerField,
  pointerValue,
  cache,
  query,
}: {
  tree: Record<string, string[]>;
  pointerField: string;
  pointerValue: any;
  cache: Cache;
  query: (collection: string) => BordaServerQuery;
}) {
  let doc;

  const join = tree[pointerField];
  const { collection, objectId } = pointerObjectFrom(pointerValue);
  const memo = cache.get(collection, objectId);

  if (!isEmpty(memo)) {
    doc = memo;
  }

  if (isEmpty(memo)) {
    doc = await query(collection).include(join).findOne(objectId);

    // memoize
    if (!isEmpty(doc)) {
      cache.set(collection, objectId, doc);
    }
  }
  return doc;
}

export async function parseJoinKeep({
  docQuery,
  obj,
  tree,
  pointerField,
  inspect,
  cache,
  query,
}: {
  docQuery: Omit<DocumentQuery, 'method'>;
  obj: any;
  tree: Record<string, string[]>;
  pointerField: string;
  inspect: boolean;
  cache: Cache;
  query: (collection: string) => BordaServerQuery;
}) {
  for (const pointerTreeField of tree[pointerField]) {
    const pointerTreeBase = pointerTreeField.split('.')[0];

    if (inspect) {
      console.log('pointerTreeField', pointerTreeField);
      console.log('pointerTreeBase', pointerTreeBase);
    }

    await parseInclude({
      obj,
      inspect,
      cache,
      query,
    })(docQuery);
  }
}

export function createTree(arr: string[]) {
  return (
    arr.reduce((acc, item) => {
      const [key, ...rest] = item.split('.');
      const value = rest.join('.');
      if (acc[key]) {
        acc[key].push(value);
      } else {
        acc[key] = [value];
      }
      acc[key] = acc[key].filter((item) => item);
      return acc;
    }, {} as Record<string, string[]>) ?? {}
  );
}

export function parseProjection<TSchema = Document>(
  projection: Partial<Projection<TSchema>>,
  objOrArray: TSchema | TSchema[]
): TSchema | TSchema[] {
  if (!projection) {
    return objOrArray;
  }

  if (Array.isArray(objOrArray)) {
    const filteredArray: TSchema[] = [];
    for (const obj of objOrArray) {
      const filteredObj = parseProjection(projection, obj);
      filteredArray.push(filteredObj as TSchema);
    }
    return filteredArray;
  } else {
    const filteredObj: TSchema = {} as TSchema;
    const isExclusion = isExclusionProjection(projection);
    for (const key in objOrArray) {
      if (isExclusion) {
        if (Array.isArray(objOrArray[key])) {
          const items = [];
          if (isKeyInExclusionProjection(key, projection)) {
            continue;
          } else {
            for (const item of objOrArray[key] as TSchema[]) {
              const filteredItem = parseProjection(
                projection[key as keyof TSchema] as Projection<TSchema>,
                item
              );

              items.push(filteredItem);
            }

            filteredObj[key as keyof TSchema] =
              items as unknown as TSchema[keyof TSchema];
          }
        } else {
          if (isKeyInExclusionProjection(key, projection)) {
            continue;
          } else {
            const filteredItem = parseProjection(
              projection[key as keyof TSchema] as Projection<TSchema>,
              objOrArray[key as keyof TSchema] as unknown as any
            );

            filteredObj[key as keyof TSchema] =
              filteredItem as TSchema[keyof TSchema];
          }
        }
      } else {
        if (key in projection) {
          if (projection[key as keyof TSchema] === 1) {
            filteredObj[key as keyof TSchema] =
              objOrArray[key as keyof TSchema];
          } else if (projection[key as keyof TSchema] === 0) {
            continue;
          } else if (typeof projection[key as keyof TSchema] === 'object') {
            const k = key as keyof TSchema;
            const v = removeUndefinedProperties(
              parseProjection(
                projection[k] as {
                  [key in keyof TSchema]: number;
                },
                objOrArray[k] as unknown as any
              )
            ) as TSchema[keyof TSchema];

            if (isEmpty(v)) {
              continue;
            } else {
              filteredObj[k] = v;
            }
          } else {
            filteredObj[key as keyof TSchema] =
              objOrArray[key as keyof TSchema];
          }
        }
      }
    }

    return filteredObj;
  }
}

function isExclusionProjection<TSchema = Document>(
  projection: Partial<Projection<TSchema>>
): boolean {
  // verify if the projection has only 0 values
  // in this case we need to change the logic
  // to return all the properties but the excluded ones with 0

  let isExclusionOnly = true;

  for (const key in projection) {
    const projected = projection[key as keyof TSchema];
    if (isNumber(projected) && projected !== 0) {
      isExclusionOnly = false;
      break;
    }
  }
  return isExclusionOnly;
}

function isKeyInExclusionProjection<TSchema = Document>(
  key: string,
  projection: Partial<Projection<TSchema>>
) {
  return (
    projection && key in projection && projection[key as keyof TSchema] === 0
  );
}

export function parseQuery({
  from,
  db,
}: {
  db: Db;
  from: DocQRLFrom;
  inspect?: boolean;
}): DocQRL {
  const collectionName = from.collection ?? '';
  const docQuery = {
    projection: {},
    options: {},
    ...from,
  } as DocumentQuery;

  const collection$ = db.collection<Document>(
    InternalCollectionName[collectionName] ?? collectionName
  );

  if (!docQuery.doc) {
    docQuery.doc = {};
  }
  if (!docQuery.docs) {
    docQuery.docs = [];
  }

  if (!isEmpty(docQuery.sort)) {
    const sortAny: any = docQuery.sort;
    for (const fieldName in sortAny) {
      if (InternalFieldName[fieldName]) {
        sortAny[InternalFieldName[fieldName]] = sortAny[fieldName];
        delete sortAny[fieldName];
      }
    }
  }

  if (!isEmpty(docQuery.filter)) {
    docQuery.filter = parseFilter(docQuery.filter || ({} as any));
  }

  if (!isEmpty(docQuery.pipeline)) {
    docQuery.pipeline = parseFilter(docQuery.pipeline || []);
  }

  const docQRL = {
    ...docQuery,
    doc: docQuery.doc,
    docs: docQuery.docs,
    collection$,
  };

  return docQRL;
}



export function parseResponse(
  obj: any,
  options = { removeSensitiveFields: true }
): any {
  try {
    /**
     * format external keys recursevely
     */
    if (Array.isArray(obj) && obj.every((item) => typeof item === 'object')) {
      for (let i = 0; i < obj.length; i++) {
        obj[i] = parseResponse(obj[i], options);
      }
    }

    if (!Array.isArray(obj) && typeof obj === 'object') {
      for (let field in obj) {
        /**
         * fallback for instances
         */
        if (field === 'collection') continue;

        if (ExternalFieldName[field]) {
          obj[ExternalFieldName[field]] = obj[field];
          delete obj[field];
          field = ExternalFieldName[field];
        }

        /**
         *  sensitive fields should only be accessible by the server
         */
        if (
          InternalSensitiveFields.includes(field) &&
          options.removeSensitiveFields
        ) {
          delete obj[field];
        }

        if (typeof obj[field] === 'object') {
          parseResponse(obj[field], options);
        }
      }
    }

    return obj;
  } catch (err: any) {
    console.log(err);
    throw err.toString(); // @todo ??
  }
}
