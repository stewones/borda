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

export function restPut({
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

      const cursor = await collection.findOneAndUpdate(
        {
          _id: {
            $eq: objectId,
          },
        },
        {
          $set: {
            ...req.body,
            _updated_at: new Date(),
          },
        }
      );
      if (cursor.ok) {
        const before = cursor.value;
        const after = await collection.findOne({
          _id: {
            $eq: objectId,
          },
        });

        const afterSaveTrigger = parseResponse(
          { before, after },
          {
            removeSensitiveFields: !isUnlocked(res.locals),
          }
        );

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
