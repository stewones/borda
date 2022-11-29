import {
  ElegError,
  ErrorCode,
  InternalCollectionName,
  parseFilter,
  parseDocs,
  Document,
  QueryMethod,
} from '@elegante/sdk';

import { Request, Response } from 'express';
import { FilterOperations, FindOptions, Sort } from 'mongodb';
import { ServerParams } from './createServer';
import { ElegServer } from './ElegServer';

export function routeCollectionsPost({
  params,
}: {
  params: ServerParams;
}): (req: Request, res: Response) => void {
  return async (req: Request, res: Response) => {
    try {
      const { db } = ElegServer;
      const { collectionName } = req.params;
      const {
        filter,
        limit,
        sort,
        projection,
        method,
        options,
      }: {
        filter: FilterOperations<Document>;
        limit: number;
        sort: Sort;
        projection: Document;
        method: QueryMethod;
        options: FindOptions<Document>;
      } = req.body || {
        filter: {},
        limit: 10000,
        sort: {},
        projection: {},
        method: null, // <-- required
        options: {},
      };
      const { allowDiskUse } = options || {};

      const docs: Document[] = [];

      const collection = db.collection<Document>(
        InternalCollectionName[collectionName] ?? collectionName
      );

      /**
       * find/findOne
       */
      if (['find', 'findOne'].includes(method)) {
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

        await cursor.forEach((doc) => {
          docs.push(doc);
        });
        return res
          .status(200)
          .send(method === 'findOne' ? parseDocs(docs)[0] : parseDocs(docs));
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
