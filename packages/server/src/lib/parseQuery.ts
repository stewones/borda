/**
 * @license
 * Copyright Elegante All Rights Reserved.
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

export interface DocQRL<T extends Document = Document>
  extends DocumentQuery<T> {
  collection$: Collection<T>;
  doc: T;
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

  if (!docQuery.doc) {
    docQuery.doc = {};
  }

  return {
    ...docQuery,
    doc: docQuery.doc,
    collection$,
  };
}
