/* eslint-disable @typescript-eslint/no-explicit-any */
import { ExternalCollectionFields } from './internal';

export function parseDocs(arr: any[]) {
  for (let item of arr) {
    item = parseDoc(item);
  }
  return arr;
}

export function parseDoc(obj: any) {
  for (let key in obj) {
    /**
     * format for external response
     */
    if (ExternalCollectionFields[key]) {
      obj[ExternalCollectionFields[key]] = obj[key];
      delete obj[key];
      key = ExternalCollectionFields[key];
    }
  }
  return obj;
}
