import {
  EleganteError,
  ErrorCode,
  InternalCollectionName,
  parseQuery,
  Document,
} from '@elegante/sdk';

import { Request, Response } from 'express';
import { EleganteServerParams } from './createServer';
import { EleganteServer } from './EleganteServer';

export function routeCollectionsPost({
  params,
}: {
  params: EleganteServerParams;
}): (req: Request, res: Response) => void {
  return async (req: Request, res: Response) => {
    try {
      const { db } = EleganteServer;
      const { collectionName } = req.params;
      const { query, sort, projection, method } = req.body;

      const docs: Document[] = [];

      const collection = db.collection<Document>(
        InternalCollectionName[collectionName] ?? collectionName
      );

      /**
       * find
       */
      if (!method || method === 'find') {
        const cursor = collection.find<Document>(
          parseQuery(query ?? null) ?? {},
          {
            sort,
            projection,
          }
        );

        await cursor.forEach((doc) => {
          docs.push(doc);
        });
        return res.status(200).send(docs);
      }

      /**
       * otherwise, count
       */
      const total = await collection.countDocuments();
      return res.status(200).json(total);
    } catch (err) {
      return res.status(500).send(new EleganteError(ErrorCode.FIND_ERROR, err));
    }
  };
}
