/* eslint-disable @typescript-eslint/no-explicit-any */
import { stringify } from './utils';

export enum ErrorCode {
  NETWORK_ERROR = -1,
  INVALID_COLLECTION_NAME = 1,
  INVALID_DOCUMENT = 2,
  INVALID_API_KEY = 3,
  INVALID_QUERY_METHOD = 4,
  SERVER_SECRET_EXPOSED = 100,
  SERVER_URL_UNDEFINED = 101,
  FETCH_ERROR = 201,
  FILTER_ONLY_SERVER = 202,
  FILTER_REQUIRED_FOR_DOC_MUTATION = 203,
  CONNECTION_FAILED = 300,
  COLLECTION_NAME_SHOULD_BE_SINGULAR = 301,
  COLLECTION_NAME_SHOULD_BE_TITLE_CASE = 302,
  COLLECTION_NOT_ALLOWED = 303,
  COLLECTION_REQUIRED = 304,
  OBJECT_ID_REQUIRED = 400,
  MONGO_METHOD_NOT_SUPPORTED = 500,
  MONGO_POINTER_ERROR = 501,
  PARSE_EXCLUDE_ERROR = 600,
  PARSE_INCLUDE_ERROR = 601,
  CREATE_INDEX_FAILED = 700,
  REST_GET_ERROR = 800,
  REST_POST_ERROR = 801,
  REST_PUT_ERROR = 802,
  REST_DELETE_ERROR = 803,
  REST_DOCUMENT_NOT_CREATED = 804,
  REST_DOCUMENT_NOT_UPDATED = 805,
  REST_DOCUMENT_NOT_DELETED = 806,
}

export class ElegError extends Error {
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
