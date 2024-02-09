/**
 * @license
 * Copyright Borda All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://borda.dev/license
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { stringify } from './utils';

export enum ErrorCode {
  UNAUTHORIZED = 401,
  NETWORK_ERROR = -1,

  DATABASE_ERROR = 1,
  DATABASE_NOT_FOUND = 2,
  DATABASE_CONNECTION_FAILED = 3,

  AUTH_SIGN_OUT_ERROR = 50,
  AUTH_NAME_REQUIRED = 51,
  AUTH_EMAIL_NOT_FOUND = 52,
  AUTH_EMAIL_ALREADY_EXISTS = 53,
  AUTH_INVALID_EMAIL = 54,
  AUTH_INVALID_API_KEY = 55,
  AUTH_INVALID_SESSION = 56,
  AUTH_PASSWORD_INCORRECT = 57,
  AUTH_PASSWORD_TOKEN_INCORRECT = 58,
  AUTH_PASSWORD_REQUIRED = 59,
  AUTH_PASSWORD_ALREADY_EXISTS = 60,
  AUTH_USER_NOT_FOUND = 61,

  SERVER_SECRET_EXPOSED = 100,
  SERVER_SECRET_REQUIRED = 101,
  SERVER_UNLOCK_ONLY = 102,
  SERVER_URL_UNDEFINED = 103,
  SERVER_INDEX_CREATION_FAILED = 104,
  SERVER_PROVIDER_ERROR = 105,
  SERVER_FUNCTION_ERROR = 106,
  SERVER_JOB_ERROR = 107,

  REST_GET_ERROR = 600,
  REST_POST_ERROR = 601,
  REST_PUT_ERROR = 602,
  REST_DELETE_ERROR = 603,
  REST_DOCUMENT_NOT_FOUND = 604,
  REST_DOCUMENT_NOT_CREATED = 605,
  REST_DOCUMENT_NOT_UPDATED = 606,
  REST_DOCUMENT_NOT_DELETED = 607,
  REST_METHOD_REQUIRED = 608,
  REST_METHOD_NOT_FOUND = 609,
  REST_FUNCTION_NOT_FOUND = 610,

  QUERY_INCLUDE_ERROR = 700,
  QUERY_EXCLUDE_ERROR = 701,
  QUERY_PIPELINE_AGGREGATE_ONLY = 702,
  QUERY_INVALID_POINTER = 703,
  QUERY_FILTER_SERVER_ONLY = 704,
  QUERY_FILTER_REQUIRED = 705,
  QUERY_SINGULAR_COLLECTION_NAME = 706,
  QUERY_TITLE_CASE_COLLECTION_NAME = 707,
  QUERY_NOT_ALLOWED = 708,
  QUERY_REQUIRED_COLLECTION_NAME = 709,

  LIVE_QUERY_INVALID_QUERY_METHOD = 800,
  LIVE_QUERY_INVALID_COLLECTION = 801,
  LIVE_QUERY_SOCKET_CLOSE = 802,
  LIVE_QUERY_INVALID_PARAMS = 803,
  LIVE_QUERY_INVALID_SESSION = 804,
  LIVE_QUERY_INVALID_SECRET = 805,
}
export class BordaError extends Error {
  code: ErrorCode;
  /**
   * @param {ErrorCode} code An error code constant from <code>BordaError</code>.
   * @param {string|object|Error} message A detailed description of the error.
   */
  constructor(code: ErrorCode, message: string | object | Error) {
    super(message as string);
    this.code = code;

    /**
     * override the default error message treating also
     * rest responses to make our Error handling Borda 💪
     */
    Object.defineProperty(this, 'message', {
      enumerable: true,
      value:
        typeof message === 'string'
          ? message
          : typeof message === 'object' &&
            typeof message.toString === 'function' &&
            !message.toString().includes('[object Object]')
          ? message.toString()
          : stringify(message),
    });
  }

  override toString() {
    return `Error ${this.code}: ${this.message}`;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
    };
  }
}
