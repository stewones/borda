/* eslint-disable @typescript-eslint/no-explicit-any */
import { stringify } from './utils';

export enum ErrorCode {
  DATABASE_ERROR = -10,
  DATABASE_NOT_FOUND = -9,
  AUTH_SIGN_OUT_ERROR = -8,
  AUTH_NAME_REQUIRED = -7,
  AUTH_EMAIL_NOT_FOUND = -6,
  AUTH_EMAIL_ALREADY_EXISTS = -5,
  AUTH_INVALID_EMAIL = -4,
  AUTH_PASSWORD_INCORRECT = -3,
  UNAUTHORIZED = -2,
  NETWORK_ERROR = -1,
  INVALID_COLLECTION_NAME = 1,
  INVALID_DOCUMENT = 2,
  INVALID_API_KEY = 3,
  INDEX_CREATION_FAILED = 4,
  SERVER_SECRET_EXPOSED = 5,
  SERVER_SECRET_REQUIRED = 6,
  SERVER_UNLOCK_ONLY = 7,
  SERVER_URL_UNDEFINED = 8,
  FETCH_ERROR = 201,
  FILTER_ONLY_SERVER = 202,
  FILTER_REQUIRED_FOR_DOC_MUTATION = 203,
  CONNECTION_FAILED = 300,
  COLLECTION_NAME_SHOULD_BE_SINGULAR = 301,
  COLLECTION_NAME_SHOULD_BE_TITLE_CASE = 302,
  COLLECTION_NOT_ALLOWED = 303,
  COLLECTION_REQUIRED = 304,
  CLOUD_FUNCTION_NOT_FOUND = 305,
  PARSE_EXCLUDE_ERROR = 600,
  PARSE_INCLUDE_ERROR = 601,
  REST_GET_ERROR = 800,
  REST_POST_ERROR = 801,
  REST_PUT_ERROR = 802,
  REST_DELETE_ERROR = 803,
  REST_DOCUMENT_NOT_FOUND = 804,
  REST_DOCUMENT_NOT_CREATED = 805,
  REST_DOCUMENT_NOT_UPDATED = 806,
  REST_DOCUMENT_NOT_DELETED = 807,
  REST_METHOD_REQUIRED = 808,
  REST_METHOD_NOT_FOUND = 809,
  LIVE_QUERY_INVALID_QUERY_METHOD = 900,
  LIVE_QUERY_INVALID_COLLECTION = 901,
  LIVE_QUERY_SOCKET_CLOSE = 902,
}

export class EleganteError extends Error {
  code: ErrorCode;
  /**
   * @param {ErrorCode} code An error code constant from <code>EleganteError</code>.
   * @param {string|object|Error} message A detailed description of the error.
   */
  constructor(code: ErrorCode, message: string | object | Error) {
    super(message as string);
    this.code = code;

    /**
     * override the default error message treating also
     * rest responses to make our Error handling Elegante 💪
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
    return `EleganteError ${this.code}: ${this.message}`;
  }
}
