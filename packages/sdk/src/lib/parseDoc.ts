/* eslint-disable @typescript-eslint/no-explicit-any */
import { ElegError, ErrorCode } from './ElegError';
import { ExternalFieldName, ExternalCollectionName } from './internal';
import { Document, DocumentQuery, query } from './query';
import { log } from './utils';

export function parseDocs<T extends Document[]>(
  arr: any[]
): (docQuery: DocumentQuery) => Promise<T[]> {
  /**
   * parse pointers
   */
  const memo: { [key: string]: T } = {};
  return async (docQuery: DocumentQuery) => {
    for (let item of arr) {
      item = await parseDoc(parseResponse(item))(docQuery, memo).catch(
        (err) => {
          throw new ElegError(ErrorCode.INVALID_DOCUMENT, err.message);
        }
      );
    }
    return Promise.resolve(arr as T[]);
  };
}

export function parseDoc<T extends Document>(
  obj: any
): (docQuery: DocumentQuery, memo: { [key: string]: T }) => Promise<T> {
  return async (docQuery, memo) => {
    const { include } = docQuery;

    for (const path of include) {
      for (const key in obj) {
        const actualKey = key.split('_p_').join('');

        if (
          !path.includes(actualKey) ||
          typeof obj[key] !== 'string' ||
          !obj[key].includes('$') ||
          memo[obj[key]]
        ) {
          continue;
        }

        /**
         * checks if the first level of the path is actually the current key
         */
        if (path.split('.')[0] !== actualKey) {
          continue;
        }
        console.log(obj[actualKey]);
        console.log(
          'detected',
          'path',
          path,
          'key',
          key,
          'actualKey',
          actualKey,
          'value',
          obj[key]
        );

        const explode = obj[key].split('$');
        const collection = ExternalCollectionName[explode[0]] ?? explode[0];
        const objectId = explode[1];

        /**
         * fetch pointer
         */
        try {
          const doc = await query<T>()
            .collection(collection)
            .filter({
              objectId: {
                $eq: objectId,
              },
            } as any)
            .findOne();
          if (!doc) continue;
          // console.log('path', path, collection, objectId, docQuery);
          // console.log(123, doc['_id']);
          /**
           * pointer reedeemed
           *  - remove pointer
           *  - add pointer value
           */
          delete obj[key]; // remove _p_ entry
          obj[actualKey] = parseResponse(doc);
          memo[obj[key]] = obj[actualKey];
          // const pathParts = path.split('.');
          // pathParts.shift();

          // const newPath = pathParts.join('.');
          // const newInclude = include.filter((p) => p !== path);
        } catch (err: any) {
          return Promise.reject(
            new ElegError(
              ErrorCode.MONGO_POINTER_ERROR,
              `unable to fetch pointer ${obj[key]} - ${err.toString()}`
            )
          );
        }
      }
    }
    return Promise.resolve(obj);
  };
}

export function parseResponse(obj: any) {
  /**
   * format for external response
   */
  for (let key in obj) {
    if (ExternalFieldName[key]) {
      obj[ExternalFieldName[key]] = obj[key];
      delete obj[key];
      key = ExternalFieldName[key];
    }
  }

  return obj;
}
