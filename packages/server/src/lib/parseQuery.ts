/* eslint-disable @typescript-eslint/no-explicit-any */
import { Collection, Document } from 'mongodb';
import {
  DocumentLiveQuery,
  DocumentQuery,
  InternalCollectionName,
} from '@elegante/sdk';
import { ElegServer } from './ElegServer';

export interface DocQRL extends DocumentQuery {
  collection$: Collection<Document>;
  doc?: Document;
}

export type DocQRLFrom = DocumentQuery | DocumentLiveQuery;

export function parseQuery(from: DocQRLFrom): DocQRL {
  const collectionName = from.collection ?? '';
  const query = {
    limit: 10000,
    sort: {},
    skip: 0,
    projection: {},
    method: null, // <-- required otherwise it should throw an error
    options: {},
    include: [],
    ...from,
  } as DocumentQuery;

  const { db } = ElegServer;

  const collection$ = db.collection<Document>(
    InternalCollectionName[collectionName] ?? collectionName
  );

  return {
    ...query,
    collection$,
  };
}
