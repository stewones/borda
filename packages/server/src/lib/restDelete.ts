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
  ExternalCollectionName,
} from '@elegante/sdk';

import { Request, Response } from 'express';
import { getCloudTrigger } from './Cloud';
import { EleganteServer, ServerParams } from './Server';
import { invalidateCache } from './Cache';
import { DocQRL } from './parseQuery';
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
              `You can't execute the operation 'delete' on '${
                ExternalCollectionName[collectionName] ?? collectionName
              }' because it's a reserved collection`
            )
          );
      }

      /**
       * @todo run beforeDelete
       */
      const docQRL: Partial<DocQRL> = {
        filter: {
          _id: {
            $eq: objectId,
          },
        },
      };
      const cursor = await collection.findOneAndUpdate(
        { ...docQRL.filter },
        { $set: { _expires_at: new Date() } },
        {
          returnDocument: 'after',
          readPreference: 'primary',
        }
      );

      if (cursor.ok && cursor.value) {
        const afterDeletePayload = parseResponse(
          { before: cursor.value, after: null },
          {
            removeSensitiveFields: !isUnlocked(res.locals),
          }
        );

        const afterDelete = getCloudTrigger(collectionName, 'afterDelete');
        if (afterDelete) {
          afterDelete.fn({
            req,
            res,
            ...afterDeletePayload,
            docQRL,
          });
        }

        invalidateCache(collectionName, cursor.value);
        return res.status(200).send();
      } else {
        return res
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
        .json(new EleganteError(ErrorCode.REST_DELETE_ERROR, err as object));
    }
  };
}
