import {
  ElegError,
  ErrorCode,
  InternalCollectionName,
  parseFilter,
  parseDocs,
  Document,
  parseDoc,
  DocumentQuery,
} from '@elegante/sdk';

import { Request, Response } from 'express';
import { ServerParams } from './createServer';
import { ElegServer } from './ElegServer';

export function routeCollectionsPost({
  params,
}: {
  params: ServerParams;
}): (req: Request, res: Response) => void {
  return async (req: Request, res: Response) => {
    try {
      const query = {
        filter: {},
        limit: 10000,
        sort: {},
        skip: 0,
        projection: {},
        method: null, // <-- required
        options: {},
        include: [],
        ...req.body,
      } as DocumentQuery;

      const { db } = ElegServer;
      const { collectionName } = req.params;
      const { filter, limit, sort, projection, method, options, skip } = query;

      const { allowDiskUse } = options || {};

      const docs: Document[] = [];

      const collection = db.collection<Document>(
        InternalCollectionName[collectionName] ?? collectionName
      );

      /**
       * find/findOne
       */
      if (['find', 'findOne'].includes(method || 'find')) {
        const cursor = collection.find<Document>(parseFilter(filter), {
          sort,
          projection,
          ...options,
        });

        if (allowDiskUse) {
          cursor.allowDiskUse(true);
        }

        if (limit) {
          cursor.limit(limit);
        }

        if (skip) {
          cursor.skip(skip);
        }

        await cursor.forEach((doc) => {
          docs.push(doc);
        });

        return res
          .status(200)
          .send(
            method === 'findOne'
              ? await parseDoc(docs[0])(query)
              : await parseDocs(docs)(query)
          );
      }

      /**
       * count
       */
      if (method === 'count') {
        const total = await collection.countDocuments();
        return res.status(200).json(total);
      }

      /**
       * not supported
       */
      return res
        .status(400)
        .send(
          new ElegError(
            ErrorCode.MONGO_METHOD_NOT_SUPPORTED,
            'Method not supported'
          )
        );
    } catch (err) {
      return res
        .status(500)
        .send(new ElegError(ErrorCode.FIND_ERROR, err as object));
    }
  };
}
