/* eslint-disable @typescript-eslint/no-explicit-any */
import { Document } from 'mongodb';
import { DocumentQuery, InternalCollectionName } from '@elegante/sdk';
import { ElegServer } from './ElegServer';

export function parseQuery(from: any) {
  const collectionName = from['collection'];
  const query = {
    filter: {},
    limit: 10000,
    sort: {},
    skip: 0,
    projection: {},
    method: null, // <-- required otherwise we're creating a new document
    options: {},
    join: [],
    ...from,
  } as DocumentQuery;

  const { db } = ElegServer;

  const collection = db.collection<Document>(
    InternalCollectionName[collectionName] ?? collectionName
  );

  return {
    ...query,
    collection,
  };
}
