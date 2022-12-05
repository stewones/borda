/* eslint-disable @typescript-eslint/no-explicit-any */
import { ExternalFieldName, InternalSensitiveFields, log } from '@elegante/sdk';

export function parseResponse(
  obj: any,
  options = { removeSensitiveFields: true }
): any {
  try {
    /**
     * format external keys recursevely
     */
    if (Array.isArray(obj) && obj.every((item) => typeof item === 'object')) {
      for (let i = 0; i < obj.length; i++) {
        obj[i] = parseResponse(obj[i], options);
      }
    }

    if (!Array.isArray(obj) && typeof obj === 'object') {
      for (let field in obj) {
        /**
         * fallback for instances
         */
        if (field === 'collection') continue;

        if (ExternalFieldName[field]) {
          obj[ExternalFieldName[field]] = obj[field];
          delete obj[field];
          field = ExternalFieldName[field];
        }

        /**
         *  sensitive fields should only be accessible by the server
         */
        if (
          InternalSensitiveFields.includes(field) &&
          options.removeSensitiveFields
        ) {
          delete obj[field];
        }

        if (typeof obj[field] === 'object') {
          parseResponse(obj[field], options);
        }
      }
    }

    return obj;
  } catch (err: any) {
    log(err);
    throw err.toString();
  }
}
