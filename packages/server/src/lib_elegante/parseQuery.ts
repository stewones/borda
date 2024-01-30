/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { Response } from 'express';
import {
  Collection,
  Document,
} from 'mongodb';

import {
  DocumentLiveQuery,
  DocumentQuery,
  InternalCollectionName,
  InternalFieldName,
  isEmpty,
} from '@elegante/sdk';

import { parseFilter } from './parseFilter';
import {
  EleganteServer,
  logInspection,
} from './Server';

export interface DocQRL<T extends Document = Document>
  extends DocumentQuery<T> {
  collection$: Collection<T>;
  doc: T;
  docs: T[];
  res?: Response;
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
  if (!docQuery.docs) {
    docQuery.docs = [];
  }

  if (!isEmpty(docQuery.sort)) {
    const sortAny: any = docQuery.sort;
    for (const fieldName in sortAny) {
      if (InternalFieldName[fieldName]) {
        sortAny[InternalFieldName[fieldName]] = sortAny[fieldName];
        delete sortAny[fieldName];
      }
    }
  }

  if (!isEmpty(docQuery.filter)) {
    docQuery.filter = parseFilter(docQuery.filter || ({} as any));
  }

  if (!isEmpty(docQuery.pipeline)) {
    docQuery.pipeline = parseFilter(docQuery.pipeline || []);
  }

  const docQRL = {
    ...docQuery,
    doc: docQuery.doc,
    docs: docQuery.docs,
    collection$,
  };
  logInspection(docQRL);

  return docQRL;
}
