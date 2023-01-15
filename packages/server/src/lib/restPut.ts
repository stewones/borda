/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  Request,
  Response,
} from 'express';

import {
  Document,
  EleganteError,
  ErrorCode,
  ExternalCollectionName,
  ExternalFieldName,
  InternalCollectionName,
  InternalFieldName,
  objectFieldsCreated,
  objectFieldsUpdated,
} from '@elegante/sdk';

import { invalidateCache } from './Cache';
import {
  CloudTriggerCallback,
  getCloudTrigger,
} from './Cloud';
import { parseDocForInsertion } from './parseDoc';
import { parseQuery } from './parseQuery';
import { parseResponse } from './parseResponse';
import { ServerParams } from './Server';
import { isUnlocked } from './utils/isUnlocked';

export function restPut({
  params,
}: {
  params: ServerParams;
}): (req: Request, res: Response) => void {
  return async (req: Request, res: Response) => {
    try {
      const { objectId, collectionName } = req.params;

      /**
       * query against to any of the reserved collections
       * if not unlocked should be strictly forbidden
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
      const docQRL = parseQuery({
        doc: req.body.doc,
        collection: collectionName,
        options: req.body.options,
      });

      const { doc, collection$ } = docQRL;

      const beforeSave = getCloudTrigger(collectionName, 'beforeSave');
      let beforeSaveCallback: CloudTriggerCallback = true;
      let document = doc;

      const docBefore = await collection$.findOne(
        {
          _id: {
            $eq: objectId,
          },
        },
        {
          readPreference: 'primary',
        }
      );

      if (beforeSave) {
        beforeSaveCallback = await beforeSave.fn({
          before: docBefore ?? undefined,
          after: undefined,
          doc: document,
          qrl: docQRL,
          context: docQRL.options?.context ?? {},
          user: res.locals['session']?.user,
          req,
          res,
        });
      }

      if (
        beforeSaveCallback &&
        typeof beforeSaveCallback === 'object' &&
        beforeSaveCallback.doc
      ) {
        document = beforeSaveCallback.doc;
      }

      document = {
        ...parseDocForInsertion(document),
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
          delete document[field];
        });
      }

      const cursor = await collection$.findOneAndUpdate(
        {
          _id: {
            $eq: objectId,
          },
        },
        {
          $set: document,
        },
        { returnDocument: 'after', readPreference: 'primary' }
      );

      if (cursor.ok) {
        if (cursor.value) {
          const docAfter = cursor.value ?? ({} as Document);
          const afterSavePayload = parseResponse(
            {
              before: docBefore,
              after: docAfter,
              doc: document,
              updatedFields: objectFieldsUpdated(docBefore, docAfter),
              createdFields: objectFieldsCreated(docBefore, docAfter),
            },
            {
              removeSensitiveFields: !isUnlocked(res.locals),
            }
          );

          const afterSave = getCloudTrigger(collectionName, 'afterSave');
          if (afterSave) {
            afterSave.fn({
              ...afterSavePayload,
              qrl: docQRL,
              context: docQRL.options?.context ?? {},
              user: res.locals['session']?.user,
              req,
              res,
            });
          }

          invalidateCache(collectionName, docAfter);
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
