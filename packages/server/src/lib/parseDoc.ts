/* eslint-disable @typescript-eslint/no-explicit-any */

import { DocumentQuery, ElegError, ErrorCode } from '@elegante/sdk';
import { ServerParams } from './ElegServer';
import { parseExclude } from './parseExclude';
import { parseJoin } from './parseJoin';
import { parseResponse } from './parseResponse';

export function parseDoc<T extends Document>(
  obj: any
): (docQuery: DocumentQuery, params: ServerParams) => Promise<T> {
  return async (docQuery, params) => {
    await parseExclude(obj)(docQuery, params).catch((err) => {
      throw new ElegError(ErrorCode.PARSE_EXCLUDE_ERROR, err.message);
    });
    await parseJoin(obj)(docQuery, params).catch((err) => {
      console.log(123, err);
      throw new ElegError(ErrorCode.PARSE_JOIN_ERROR, err.message);
    });
    parseResponse(obj);
    return Promise.resolve(obj);
  };
}

export function parseDocs<T extends Document[]>(
  arr: any[]
): (docQuery: DocumentQuery, params: ServerParams) => Promise<T[]> {
  return async (docQuery, params) => {
    for (let item of arr) {
      item = await parseDoc(item)(docQuery, params);
    }
    return Promise.resolve(arr as T[]);
  };
}
