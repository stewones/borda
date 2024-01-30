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

import { isUnlocked } from '../utils/isUnlocked';
import { invalidateCache } from './Cache';
import {
  CloudTriggerCallback,
  getCloudTrigger,
} from './Cloud';
import { parseDocForInsertion } from './parseDoc';
import { DocQRL } from './parseQuery';
import { parseResponse } from './parseResponse';

export async function restPostUpdate({
  req,
  res,
  docQRL,
}: {
  req: Request;
  res: Response;
  docQRL: DocQRL;
}) {
  try {
    const { collection$, collection, filter } = docQRL;
    const docBefore = await collection$.findOne(filter || ({} as any), {
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
      const d = parseDocForInsertion(docQRL.doc);

      const doc: Document = {
        ...d,
        _updated_at: d._updated_at ?? new Date(),
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

      let payload: any = {
        $set: doc,
      };

      // checks if doc has any prop starting with $ to allow update filter operators coming from the client
      if (hasMongoOperators(doc)) {
        payload = doc;
      }

      const cursor = await collection$.findOneAndUpdate(
        filter || ({} as any),
        payload,
        {
          returnDocument: 'after',
          readPreference: 'primary',
        }
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
  } catch (err) {
    return res
      .status(500)
      .json(
        new EleganteError(ErrorCode.REST_POST_ERROR, err as object).toJSON()
      );
  }
}

function hasMongoOperators(doc: any): boolean {
  if (typeof doc !== 'object' || doc === null) {
    return false;
  }

  for (const key in doc) {
    if (key.startsWith('$')) {
      return true;
    }

    if (typeof doc[key] === 'object' && doc[key] !== null) {
      const hasOperator = hasMongoOperators(doc[key]);
      if (hasOperator) {
        return true;
      }
    }

    if (Array.isArray(doc[key])) {
      for (const item of doc[key]) {
        if (typeof item === 'object' && item !== null) {
          const hasOperator = hasMongoOperators(item);
          if (hasOperator) {
            return true;
          }
        }
      }
    }
  }

  return false;
}
