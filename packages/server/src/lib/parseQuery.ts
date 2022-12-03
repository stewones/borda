import { Request } from 'express';
import { Document, DocumentQuery, InternalCollectionName } from '@elegante/sdk';
import { ElegServer } from './ElegServer';

/**
 *
 *
 * @export
 * @param {Request} req
 * @returns {*}
 */
export function parseQuery(req: Request) {
  const query = {
    filter: {},
    limit: 10000,
    sort: {},
    skip: 0,
    projection: {},
    method: null, // <-- required otherwise we're creating a new document
    options: {},
    join: [],
    ...req.body,
  } as DocumentQuery;

  const { db } = ElegServer;
  const { collectionName } = req.params;

  const collection = db.collection<Document>(
    InternalCollectionName[collectionName] ?? collectionName
  );

  return {
    ...query,
    collection,
  };
}
