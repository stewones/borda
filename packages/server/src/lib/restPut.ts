/**
 * @license
 * Copyright Intenseloop LTD All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

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
import { EleganteServer, ServerParams } from './Server';
import { invalidateCache } from './Cache';
import { parseResponse } from './parseResponse';
import { isUnlocked } from './utils/isUnlocked';
import { parseDocForInsertion } from './parseDoc';
import { CloudTriggerCallback, getCloudTrigger } from './Cloud';

export function restPut({
  params,
}: {
  params: ServerParams;
}): (req: Request, res: Response) => void {
  return async (req: Request, res: Response) => {
    try {
      const { db } = EleganteServer;
      const { objectId } = req.params;
      let { collectionName } = req.params;

      collectionName = InternalCollectionName[collectionName] ?? collectionName;

      const collection = db.collection<Document>(collectionName);

      let beforeSaveCallback: CloudTriggerCallback = true;

      const beforeSave = getCloudTrigger(collectionName, 'beforeSave');

      /**
       * can't update to any of the reserved collections if not unlocked
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

      if (beforeSave) {
        beforeSaveCallback = await beforeSave.fn({
          req,
          res,
          before: null,
          after: req.body.doc,
        });
      }

      if (
        beforeSaveCallback &&
        typeof beforeSaveCallback === 'object' &&
        beforeSaveCallback.after
      ) {
        req.body.doc = beforeSaveCallback.after;
      }

      if (beforeSaveCallback) {
        const doc: Document = {
          ...parseDocForInsertion(req.body.doc),
          _updated_at: new Date(),
        };

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
            delete doc[field];
          });
        }

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
            $set: doc,
          },
          { returnDocument: 'after', readPreference: 'primary' }
        );

        if (cursor.ok) {
          if (cursor.value) {
            const after = cursor.value ?? ({} as Document);
            const afterSavePayload = parseResponse(
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

            const afterSave = getCloudTrigger(collectionName, 'afterSave');
            if (afterSave) {
              afterSave.fn({
                req,
                res,
                ...afterSavePayload,
              });
            }

            invalidateCache(collectionName, after);
            return res.status(200).json({});
          } else {
            return res
              .status(404)
              .json(
                new EleganteError(
                  ErrorCode.REST_DOCUMENT_NOT_UPDATED,
                  'document not found'
                )
              );
          }
        } else {
          return Promise.reject(
            new EleganteError(
              ErrorCode.REST_DOCUMENT_NOT_UPDATED,
              'could not update document'
            )
          );
        }
      }
      /**
       * didn't pass the beforeSave trigger
       * but also doesn't mean it's an error
       */
      return res.status(200).json({});
    } catch (err) {
      return res
        .status(500)
        .json(new EleganteError(ErrorCode.REST_PUT_ERROR, err as object));
    }
  };
}
