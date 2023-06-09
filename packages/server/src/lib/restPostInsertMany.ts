import { Request, Response } from 'express';

import { Document, EleganteError, ErrorCode } from '@elegante/sdk';

import { CloudTriggerCallback, getCloudTrigger } from './Cloud';
import { parseDocForInsertion } from './parseDoc';
import { DocQRL } from './parseQuery';
import { parseResponse } from './parseResponse';
import { newObjectId } from './utils';
import { isUnlocked } from './utils/isUnlocked';

export async function restPostInsertMany({
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

    const beforeSave = getCloudTrigger(collection, 'beforeSaveMany');

    if (beforeSave) {
      beforeSaveCallback = await beforeSave.fn({
        before: undefined,
        after: undefined,
        doc: undefined,
        docs: docQRL.docs ?? undefined,
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
      beforeSaveCallback.docs
    ) {
      docQRL.docs = beforeSaveCallback.docs;
    }

    if (beforeSaveCallback) {
      /**
       * insert new documents
       */
      const docs: Document[] = [];

      docQRL.docs.map((d) => {
        const doc = parseDocForInsertion(d);

        if (docQRL?.options?.insert?.updatedAt !== false) {
          doc['_updated_at'] = d['_updated_at'] ?? new Date();
        }

        docs.push({
          ...doc,
          _id: doc._id ?? newObjectId(),
          _created_at: doc._created_at ?? new Date(),
        });
      });

      const cursor = await collection$.insertMany(docs);

      if (cursor.acknowledged) {
        const afterSavePayload = parseResponse(
          {
            before: null,
            after: docs,
            docs,
          },
          {
            removeSensitiveFields: !isUnlocked(res.locals),
          }
        );

        const afterSave = getCloudTrigger(collection, 'afterSaveMany');
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

        return res.status(201).json(cursor);
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
      .json(new EleganteError(ErrorCode.REST_POST_ERROR, err as object));
  }
}
