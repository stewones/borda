/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  DocumentQuery,
  EleganteError,
  ErrorCode,
  InternalFieldName,
  isISODate,
  log,
} from '@elegante/sdk';
import { ServerParams } from './EleganteServer';
import { parseExclude } from './parseExclude';
import { parseInclude } from './parseInclude';
import { parseResponse } from './parseResponse';
import { isUnlocked } from './utils/isUnlocked';

export function parseDoc<T extends Document>(
  obj: any
): (docQuery: DocumentQuery, params: ServerParams, locals: any) => Promise<T> {
  return async (docQuery, params, locals) => {
    await parseInclude(obj)(docQuery, params, locals).catch((err) => {
      throw new EleganteError(ErrorCode.PARSE_INCLUDE_ERROR, err.message);
    });
    await parseExclude(obj)(docQuery, params).catch((err) => {
      throw new EleganteError(ErrorCode.PARSE_EXCLUDE_ERROR, err.message);
    });

    return Promise.resolve(
      parseResponse(obj, {
        removeSensitiveFields: !isUnlocked(locals),
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
        /**
         * fallback for instances
         */
        if (InternalFieldName[field]) {
          obj[InternalFieldName[field]] = obj[field];
          delete obj[field];
          field = InternalFieldName[field];
        }

        if (isISODate(obj[field])) {
          obj[field] = new Date(obj[field]);
        }

        if (typeof obj[field] === 'object') {
          parseDocForInsertion(obj[field]);
        }
      }
    }

    return obj;
  } catch (err: any) {
    log(err);
    throw err.toString();
  }
}
