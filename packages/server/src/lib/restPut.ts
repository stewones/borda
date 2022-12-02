/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  ElegError,
  ErrorCode,
  InternalCollectionName,
  Document,
  objectFieldsUpdated,
  objectFieldsCreated,
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

      const before = await collection.findOne(
        {
          _id: {
            $eq: objectId,
          },
        },
        {
          readPreference: 'primaryPreferred',
        }
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
        },
        { returnDocument: 'after', readPreference: 'primary' }
      );

      if (cursor.ok) {
        const after = cursor.value;
        const afterSaveTrigger = parseResponse(
          {
            before,
            after,
            updatedFields: objectFieldsUpdated(before, after),
            createdFields: objectFieldsCreated(before, after),
          },
          {
            removeSensitiveFields: !isUnlocked(res.locals),
          }
        );
        console.log(afterSaveTrigger);
        return res.status(200).send();
      }

      return Promise.reject(
        new ElegError(
          ErrorCode.REST_DOCUMENT_NOT_UPDATED,
          cursor.lastErrorObject ?? 'coud not update document'
        )
      );
    } catch (err) {
      return res
        .status(500)
        .send(new ElegError(ErrorCode.REST_PUT_ERROR, err as object));
    }
  };
}
