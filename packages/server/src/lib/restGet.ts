import {
  ElegError,
  ErrorCode,
  InternalCollectionName,
  Document,
} from '@elegante/sdk';

import { Request, Response } from 'express';
import { ElegServer, ServerParams } from './ElegServer';

/**
 * @todo
 */
export function restGet({
  params,
}: {
  params: ServerParams;
}): (req: Request, res: Response) => void {
  return async (req: Request, res: Response) => {
    try {
      const { db } = ElegServer;
      const { collectionName, objectId } = req.params;
      const { projection } = req.body;

      if (!collectionName) {
        return res
          .status(400)
          .send(
            new ElegError(
              ErrorCode.COLLECTION_NAME_REQUIRED,
              'Missing collection name'
            )
          );
      }

      if (!objectId) {
        return res
          .status(400)
          .send(
            new ElegError(ErrorCode.OBJECT_ID_REQUIRED, 'Missing objectId')
          );
      }

      const collection = db.collection<Document>(
        InternalCollectionName[collectionName] ?? collectionName
      );

      const doc = await collection.findOne<Document>(
        {
          _id: objectId,
        },
        {
          projection,
        }
      );

      return res.status(200).send(doc);
    } catch (err) {
      return res
        .status(500)
        .send(new ElegError(ErrorCode.FIND_ERROR, err as object));
    }
  };
}
