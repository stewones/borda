/* eslint-disable @typescript-eslint/no-explicit-any */
import { ExternalFieldName } from '@elegante/sdk';

export function parseResponse(obj: any) {
  /**
   * format external keys recursevely
   */
  if (Array.isArray(obj) && obj.every((item) => typeof item === 'object')) {
    for (let i = 0; i < obj.length; i++) {
      obj[i] = parseResponse(obj[i]);
    }
  }

  if (!Array.isArray(obj) && typeof obj === 'object') {
    for (let field in obj) {
      if (ExternalFieldName[field]) {
        obj[ExternalFieldName[field]] = obj[field];
        delete obj[field];
        field = ExternalFieldName[field];
      }
      if (typeof obj[field] === 'object') {
        parseResponse(obj[field]);
      }
    }
  }

  return obj;
}
