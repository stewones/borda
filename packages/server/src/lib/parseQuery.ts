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
  doc?: Document | null | undefined;
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

  return {
    ...docQuery,
    collection$,
  };
}
