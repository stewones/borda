import {
  EleganteError,
  ErrorCode,
  InternalCollectionName,
  Document,
  ExternalCollectionName,
} from '@elegante/sdk';

import { Request, Response } from 'express';
import { EleganteServer, ServerParams } from './EleganteServer';
import { parseResponse } from './parseResponse';
import { isUnlocked } from './utils/isUnlocked';

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
      const { db } = EleganteServer;
      const { collectionName, objectId } = req.params;

      const collection = db.collection<Document>(
        InternalCollectionName[collectionName] ?? collectionName
      );

      /**
       * can't delete to any of the reserved collections if not unlocked
       */
      const reservedCollections = [
        ...Object.keys(InternalCollectionName),
        ...Object.keys(ExternalCollectionName),
      ];
      if (
        !isUnlocked(res.locals) &&
        reservedCollections.includes(collectionName)
      ) {
        return res
          .status(405)
          .json(
            new EleganteError(
              ErrorCode.COLLECTION_NOT_ALLOWED,
              `You can't get on collection ${collectionName} because it's reserved`
            )
          );
      }

      /**
       * @todo run beforeFind and afterFind hooks
       */
      const doc = await collection.findOne<Document>({
        _id: objectId,
      });

      return res.status(200).send(
        parseResponse(doc, {
          removeSensitiveFields: !isUnlocked(res.locals),
        })
      );
    } catch (err) {
      return res
        .status(500)
        .send(new EleganteError(ErrorCode.REST_GET_ERROR, err as object));
    }
  };
}
