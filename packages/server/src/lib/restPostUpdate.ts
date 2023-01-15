import {
  Request,
  Response,
} from 'express';

import {
  Document,
  EleganteError,
  ErrorCode,
  ExternalFieldName,
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
import { DocQRL } from './parseQuery';
import { parseResponse } from './parseResponse';
import { isUnlocked } from './utils/isUnlocked';

export async function restPostUpdate({
  req,
  res,
  docQRL,
}: {
  req: Request;
  res: Response;
  docQRL: DocQRL;
}) {
  const { collection$, collection, filter } = docQRL;
  const docBefore = await collection$.findOne(filter || {}, {
    readPreference: 'primary',
  });

  let beforeSaveCallback: CloudTriggerCallback = true;
  const beforeSave = getCloudTrigger(collection, 'beforeSave');
  if (beforeSave) {
    beforeSaveCallback = await beforeSave.fn({
      before: docBefore ?? undefined,
      after: undefined,
      doc: docQRL.doc ?? undefined,
      qrl: docQRL,
      context: docQRL.options?.context ?? {},
      user: res.locals['session']?.user,
      req,
      res,
    });
  }

  if (beforeSaveCallback) {
    if (
      beforeSaveCallback &&
      typeof beforeSaveCallback === 'object' &&
      beforeSaveCallback.doc
    ) {
      docQRL.doc = beforeSaveCallback.doc;
    }

    const doc: Document = {
      ...parseDocForInsertion(docQRL.doc),
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

    const cursor = await collection$.findOneAndUpdate(
      filter || {},
      {
        $set: doc,
      },
      { returnDocument: 'after', readPreference: 'primary' }
    );

    if (cursor.ok) {
      const docAfter = cursor.value ?? ({} as Document);
      const afterSavePayload = parseResponse(
        {
          before: docBefore,
          after: docAfter,
          doc: docQRL.doc,
          updatedFields: objectFieldsUpdated(docBefore, docAfter),
          createdFields: objectFieldsCreated(docBefore, docAfter),
        },
        {
          removeSensitiveFields: !isUnlocked(res.locals),
        }
      );

      const afterSave = getCloudTrigger(collection, 'afterSave');

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

      invalidateCache(collection, docAfter);
      return res.status(200).json({});
    } else {
      return Promise.reject(
        new EleganteError(
          ErrorCode.REST_DOCUMENT_NOT_UPDATED,
          `could not update ${collection} document`
        )
      );
    }
  }

  /**
   * didn't pass the beforeSave trigger
   * but also doesn't mean it's an error
   */
  return res.status(200).json({});
}
