/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  DocumentQuery,
  EleganteError,
  ErrorCode,
  InternalFieldName,
  isISODate,
  isPointer,
  log,
} from '@elegante/sdk';

import { isUnlocked } from '../utils/isUnlocked';
import { parseExclude } from './parseExclude';
import { parseInclude } from './parseInclude';
import { parseResponse } from './parseResponse';
import { ServerParams } from './Server';

export function parseDoc<T extends Document>(
  obj: any
): (docQuery: DocumentQuery, params: ServerParams, locals: any) => Promise<T> {
  return async (docQuery, params, locals) => {
    await parseInclude(obj ?? {})(docQuery, params, locals).catch((err) => {
      throw new EleganteError(ErrorCode.QUERY_INCLUDE_ERROR, err.message);
    });
    await parseExclude(obj ?? {})(docQuery, params).catch((err) => {
      throw new EleganteError(ErrorCode.QUERY_EXCLUDE_ERROR, err.message);
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
    log(err);
    throw err.toString();
  }
}