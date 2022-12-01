/* eslint-disable @typescript-eslint/no-explicit-any */

import { DocumentQuery, ElegError, ErrorCode } from '@elegante/sdk';
import { ServerParams } from './ElegServer';
import { parseExclude } from './parseExclude';
import { parseInclude } from './parseInclude';
import { parseResponse } from './parseResponse';

export function parseDoc<T extends Document>(
  obj: any
): (docQuery: DocumentQuery, params: ServerParams, locals: any) => Promise<T> {
  return async (docQuery, params, locals) => {
    await parseInclude(obj)(docQuery, params, locals).catch((err) => {
      throw new ElegError(ErrorCode.PARSE_INCLUDE_ERROR, err.message);
    });
    await parseExclude(obj)(docQuery, params).catch((err) => {
      throw new ElegError(ErrorCode.PARSE_EXCLUDE_ERROR, err.message);
    });

    return Promise.resolve(
      parseResponse(obj, {
        removeSensitiveFields: locals && locals.unlocked ? false : true,
      })
    );
  };
}

export function parseDocs<T extends Document[]>(
  arr: any[]
): (
  docQuery: DocumentQuery,
  params: ServerParams,
  locals: any
) => Promise<T[]> {
  return async (docQuery, params, locals) => {
    for (let item of arr) {
      item = await parseDoc(item)(docQuery, params, locals);
    }
    return Promise.resolve(arr as T[]);
  };
}
