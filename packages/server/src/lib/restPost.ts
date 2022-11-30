/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  ElegError,
  ErrorCode,
  InternalCollectionName,
  parseFilter,
  parseDoc,
  parseDocs,
  Document,
  DocumentQuery,
} from '@elegante/sdk';

import { Request, Response } from 'express';
import { ElegServer, ServerParams } from './ElegServer';

export function restPost({
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
              ? await parseDoc(docs[0])(query, params)
              : await parseDocs(docs)(query, params)
          );
      }

      /**
       * count
       */
      if (method === 'count') {
        const total = await collection.countDocuments(parseFilter(filter));
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
