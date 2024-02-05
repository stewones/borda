/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { Document, DocumentEvent } from './query';

export type LiveQueryMethod = 'on' | 'once';

export interface LiveQueryMessage<T = any> extends Document {
  doc: T;
  docs: T[];
  updatedFields?: Partial<T> | undefined;
  removedFields?: string[] | undefined;
  truncatedArrays?:
    | {
        /** The name of the truncated field. */
        field: string;
        /** The number of elements in the truncated array. */
        newSize: number;
      }[]
    | undefined;
}

export interface DocumentLiveQuery /*<TSchema extends Document = Document> extends DocumentQuery<TSchema>*/ {
  collection: string;
  event?: DocumentEvent | undefined;
  method: LiveQueryMethod;
}
