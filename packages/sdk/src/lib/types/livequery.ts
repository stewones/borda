/* eslint-disable @typescript-eslint/no-explicit-any */
import { Document, DocumentEvent, DocumentQuery } from './query';

export type LiveQueryMethod = 'on' | 'once';

export interface LiveQueryMessage<T = any> extends Document {
  doc: T;
  docs: T[];
  updatedFields?: Partial<T> | undefined;
  removedFields?: string[] | undefined;
  truncatedArrays?:
    | Array<{
        /** The name of the truncated field. */
        field: string;
        /** The number of elements in the truncated array. */
        newSize: number;
      }>
    | undefined;
}

export interface DocumentLiveQuery<T = Document> extends DocumentQuery<T> {
  unlock: boolean; // @todo ?? this would be a way to enable live query on a public collection.
  collection: string;
  event?: DocumentEvent | undefined;
  method: LiveQueryMethod;
}
