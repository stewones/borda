/* eslint-disable @typescript-eslint/no-explicit-any */
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

export function restDelete({
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
              `You can't delete on collection ${collectionName} because it's reserved`
            )
          );
      }

      /**
       * @todo run beforeDelete and afterDelete hooks
       */
      const cursor = await collection.findOneAndUpdate(
        {
          _id: {
            $eq: objectId,
          },
        },
        { $set: { _expires_at: new Date() } },
        {
          returnDocument: 'after',
          readPreference: 'primary',
        }
      );

      if (cursor.ok && cursor.value) {
        const afterDeleteTrigger = parseResponse(
          { doc: cursor.value },
          {
            removeSensitiveFields: !isUnlocked(res.locals),
          }
        );
        // console.log(afterDeleteTrigger);
        // @todo trigger afterDeleteTrigger
        return res.status(200).send();
      } else {
        res
          .status(404)
          .json(
            new EleganteError(
              ErrorCode.REST_DOCUMENT_NOT_FOUND,
              'document not found'
            )
          );
      }
    } catch (err) {
      return res
        .status(500)
        .send(new EleganteError(ErrorCode.REST_DELETE_ERROR, err as object));
    }
  };
}
