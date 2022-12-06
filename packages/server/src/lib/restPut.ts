/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  EleganteError,
  ErrorCode,
  InternalCollectionName,
  Document,
  objectFieldsUpdated,
  objectFieldsCreated,
  ExternalCollectionName,
  InternalFieldName,
  ExternalFieldName,
} from '@elegante/sdk';

import { Request, Response } from 'express';
import { EleganteServer, ServerParams } from './EleganteServer';
import { parseResponse } from './parseResponse';
import { isUnlocked } from './utils/isUnlocked';

export function restPut({
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

      const payload = {
        ...req.body.doc,
        _updated_at: new Date(),
      };

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
              `You can't execute the operation 'put' on '${
                ExternalCollectionName[collectionName] ?? collectionName
              }' because it's a reserved collection`
            )
          );
      }

      /**
       * ensure each internal/external field is deleted from the user payload
       * if session is not unlocked
       */
      const reservedFields = [
        ...Object.keys(InternalFieldName),
        ...Object.keys(ExternalFieldName),
      ];

      if (!isUnlocked(res.locals)) {
        reservedFields.forEach((field) => {
          delete payload[field];
        });
      }

      /**
       * @todo run beforeUpdate and afterUpdate hooks
       */
      const before = await collection.findOne(
        {
          _id: {
            $eq: objectId,
          },
        },
        {
          readPreference: 'primary',
        }
      );

      const cursor = await collection.findOneAndUpdate(
        {
          _id: {
            $eq: objectId,
          },
        },
        {
          $set: payload,
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
        // console.log(afterSaveTrigger);
        return res.status(200).send();
      }

      return Promise.reject(
        new EleganteError(
          ErrorCode.REST_DOCUMENT_NOT_UPDATED,
          cursor.lastErrorObject ?? 'coud not update document'
        )
      );
    } catch (err) {
      return res
        .status(500)
        .send(new EleganteError(ErrorCode.REST_PUT_ERROR, err as object));
    }
  };
}
