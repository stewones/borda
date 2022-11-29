/* eslint-disable @typescript-eslint/no-explicit-any */
import { stringify } from './utils';

export enum ErrorCode {
  NETWORK_ERROR = -2,
  OTHER_CAUSE = -1,
  INTERNAL_SERVER_ERROR = 1,
  CONNECTION_FAILED = 100,
  INVALID_COLLECTION_NAME = 101,
  SERVER_SECRET_EXPOSED = 102,
  SERVER_URL_UNDEFINED = 103,
  FIND_ERROR = 104,
  COLLECTION_NAME_REQUIRED = 105,
  OBJECT_ID_REQUIRED = 106,
  MONGO_METHOD_NOT_SUPPORTED = 107,
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
