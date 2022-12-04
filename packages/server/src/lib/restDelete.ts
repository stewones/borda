/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  ElegError,
  ErrorCode,
  InternalCollectionName,
  Document,
} from '@elegante/sdk';

import { Request, Response } from 'express';
import { ElegServer, ServerParams } from './ElegServer';
import { parseResponse } from './parseResponse';
import { isUnlocked } from './utils/isUnlocked';

export function restDelete({
  params,
}: {
  params: ServerParams;
}): (req: Request, res: Response) => void {
  return async (req: Request, res: Response) => {
    try {
      const { db } = ElegServer;
      const { collectionName, objectId } = req.params;

      const collection = db.collection<Document>(
        InternalCollectionName[collectionName] ?? collectionName
      );

      /**
       * @todo run beforeDelete and afterDelete hooks
       */
      const cursor = await collection.findOneAndUpdate(
        {
          _id: {
            $eq: objectId,
          },
        },
        { $set: { _deleted_at: new Date() } },
        {
          returnDocument: 'after',
          readPreference: 'primary',
        }
      );

      if (cursor.ok) {
        const afterDeleteTrigger = parseResponse(
          { doc: cursor.value },
          {
            removeSensitiveFields: !isUnlocked(res.locals),
          }
        );
        console.log(afterDeleteTrigger);
        // @todo trigger afterDeleteTrigger
        return res.status(200).send();
      }

      return Promise.reject(
        new ElegError(
          ErrorCode.REST_DOCUMENT_NOT_DELETED,
          cursor.lastErrorObject ?? 'could not delete document'
        )
      );
    } catch (err) {
      return res
        .status(500)
        .send(new ElegError(ErrorCode.REST_DELETE_ERROR, err as object));
    }
  };
}
