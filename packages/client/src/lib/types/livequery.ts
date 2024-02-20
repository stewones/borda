/**
 * @license
 * Copyright Borda All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://borda.dev/license
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  Document,
  DocumentEvent,
  DocumentFilter,
  DocumentOptions,
  DocumentPipeline,
  Sort,
} from './query';

export type LiveQueryMethod = 'on' | 'once';

export interface LiveQueryMessage<T = Document> extends Document {
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

export interface DocumentLiveQuery<TSchema = Document> {
  event?: DocumentEvent | undefined;
  filter: DocumentFilter<TSchema>;
  limit?: number;
  skip?: number;
  sort?: Sort;
  projection?: Partial<{
    [key in keyof TSchema]: number;
  }>;
  options?: DocumentOptions;
  pipeline?: DocumentPipeline<TSchema>[];
  include?: string[];
  exclude?: string[];
  collection: string;
  inspect?: boolean;
  unlock?: boolean;
  method: LiveQueryMethod;
}
