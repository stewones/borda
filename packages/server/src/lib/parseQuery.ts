/**
 * @license
 * Copyright Intenseloop LTD All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { Collection, Document } from 'mongodb';

import {
  DocumentLiveQuery,
  DocumentQuery,
  InternalCollectionName,
} from '@elegante/sdk';

import { EleganteServer } from './Server';

export interface DocQRL extends DocumentQuery {
  collection$: Collection<Document>;
  doc: Document;
}

export type DocQRLFrom = DocumentQuery | DocumentLiveQuery | Document;

export function parseQuery(from: DocQRLFrom): DocQRL {
  const collectionName = from.collection ?? '';
  const docQuery = {
    projection: {},
    options: {},
    ...from,
  } as DocumentQuery;

  const { db } = EleganteServer;

  const collection$ = db.collection<Document>(
    InternalCollectionName[collectionName] ?? collectionName
  );

  if (docQuery.doc) {
    /**
     * remove fields that are also pointers
     */
    for (const field in docQuery.doc) {
      if (docQuery.doc[`_p_${field}`]) {
        delete docQuery.doc[field];
      }
    }
  } else {
    docQuery.doc = {};
  }

  return {
    ...docQuery,
    doc: docQuery.doc,
    collection$,
  };
}
