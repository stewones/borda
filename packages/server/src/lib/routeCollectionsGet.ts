import {
  EleganteError,
  ErrorCode,
  InternalCollectionName,
  Document,
} from '@elegante/sdk';

import { Request, Response } from 'express';
import { EleganteServerParams } from './createServer';
import { EleganteServer } from './EleganteServer';

export function routeCollectionsGet({
  params,
}: {
  params: EleganteServerParams;
}): (req: Request, res: Response) => void {
  return async (req: Request, res: Response) => {
    try {
      const { db } = EleganteServer;
      const { collectionName, objectId } = req.params;
      const { projection } = req.body;

      if (!collectionName) {
        return res
          .status(400)
          .send(
            new EleganteError(
              ErrorCode.COLLECTION_NAME_REQUIRED,
              'Missing collection name'
            )
          );
      }

      if (!objectId) {
        return res
          .status(400)
          .send(
            new EleganteError(ErrorCode.OBJECT_ID_REQUIRED, 'Missing objectId')
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
      return res.status(500).send(new EleganteError(ErrorCode.FIND_ERROR, err));
    }
  };
}
