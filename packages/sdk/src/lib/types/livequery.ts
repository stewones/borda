import { Document } from './query';

export interface LiveQueryMessage {
  doc?: Document | undefined;
  docs?: Document[] | undefined;
  updatedFields?: Partial<Document> | undefined;
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
