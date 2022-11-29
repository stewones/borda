/* eslint-disable @typescript-eslint/no-explicit-any */
import { stringify } from './utils';

export enum ErrorCode {
  OTHER_CAUSE = -1,
  INTERNAL_SERVER_ERROR = 1,
  CONNECTION_FAILED = 100,
  OBJECT_NOT_FOUND = 101,
  INVALID_QUERY = 102,
  INVALID_COLLECTION_NAME = 103,
  MISSING_OBJECT_ID = 104,
  SERVER_SECRET_EXPOSED = 105,
  FIND_ERROR = 106,
  COLLECTION_NAME_REQUIRED = 107,
  OBJECT_ID_REQUIRED = 108,
}

export class EleganteError extends Error {
  code: ErrorCode;
  /**
   * @param {ErrorCode} code An error code constant from <code>EleganteError</code>.
   * @param {any} message A detailed description of the error.
   */
  constructor(code: ErrorCode, message: any) {
    super(message);
    this.code = code;

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

    // console.trace();
  }

  override toString() {
    return `EleganteError [${this.code}]: ${this.message}`;
  }
}
