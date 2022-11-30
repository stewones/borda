/* eslint-disable @typescript-eslint/no-explicit-any */
import { stringify } from './utils';

export enum ErrorCode {
  NETWORK_ERROR = -1,
  INVALID_COLLECTION_NAME = 1,
  INVALID_DOCUMENT = 2,
  SERVER_SECRET_EXPOSED = 100,
  SERVER_URL_UNDEFINED = 101,
  FIND_ERROR = 200,
  FETCH_ERROR = 201,
  FILTER_ONLY_SERVER = 202,
  CONNECTION_FAILED = 300,
  COLLECTION_NAME_REQUIRED = 301,
  OBJECT_ID_REQUIRED = 400,
  MONGO_METHOD_NOT_SUPPORTED = 500,
  MONGO_POINTER_ERROR = 501,
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
