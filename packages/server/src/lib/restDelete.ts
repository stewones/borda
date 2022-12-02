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

      const doc = await collection.findOne({
        _id: {
          $eq: objectId,
        },
      });
      const cursor = await collection.findOneAndUpdate(
        {
          _id: {
            $eq: objectId,
          },
        },
        { $set: { _deleted_at: new Date() } }
      );

      if (cursor.ok) {
        const afterDeleteTrigger = parseResponse(
          { doc },
          {
            removeSensitiveFields: !isUnlocked(res.locals),
          }
        );
        // @todo trigger afterDeleteTrigger
        return res.status(200).send();
      }
      throw cursor.lastErrorObject;
    } catch (err) {
      return res
        .status(500)
        .send(new ElegError(ErrorCode.PUT_ERROR, err as object));
    }
  };
}
