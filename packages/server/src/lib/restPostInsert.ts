import { Request, Response } from 'express';

import {
  Document,
  EleganteError,
  ErrorCode,
  objectFieldsCreated,
  objectFieldsUpdated,
} from '@elegante/sdk';

import { CloudTriggerCallback, getCloudTrigger } from './Cloud';
import { parseDocForInsertion } from './parseDoc';
import { DocQRL } from './parseQuery';
import { parseResponse } from './parseResponse';
import { newObjectId } from './utils';
import { isUnlocked } from './utils/isUnlocked';

export async function restPostInsert({
  req,
  res,
  docQRL,
}: {
  req: Request;
  res: Response;
  docQRL: DocQRL;
}) {
  try {
    const { collection$, collection } = docQRL;

    let beforeSaveCallback: CloudTriggerCallback = true;

    const beforeSave = getCloudTrigger(collection, 'beforeSave');

    if (beforeSave) {
      beforeSaveCallback = await beforeSave.fn({
        before: undefined,
        after: undefined,
        doc: docQRL.doc ?? undefined,
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
      docQRL.doc = beforeSaveCallback.doc;
    }

    if (beforeSaveCallback) {
      /**
       * insert new documents
       */
      const d = parseDocForInsertion(docQRL.doc);
      const doc: Document = {
        ...d,
        _id: d._id ?? newObjectId(),
        _created_at:
          d._created_at && isUnlocked(res.locals) ? d._created_at : new Date(),
      };

      if (docQRL?.options?.insert?.updatedAt !== false) {
        doc['_updated_at'] = d._updated_at ?? new Date();
      }

      const cursor = await collection$.insertOne(doc);

      if (cursor.acknowledged) {
        const afterSavePayload = parseResponse(
          {
            before: null,
            after: doc,
            doc,
            updatedFields: objectFieldsUpdated({}, doc),
            createdFields: objectFieldsCreated({}, doc),
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

        return res.status(201).json(afterSavePayload.doc);
      } else {
        return Promise.reject(
          new EleganteError(
            ErrorCode.REST_DOCUMENT_NOT_CREATED,
            `could not create ${collection} document`
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
      .json(
        new EleganteError(ErrorCode.REST_POST_ERROR, err as object).toJSON()
      );
  }
}
