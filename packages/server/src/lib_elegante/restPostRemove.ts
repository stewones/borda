import {
  Request,
  Response,
} from 'express';

import {
  EleganteError,
  ErrorCode,
} from '@elegante/sdk';

import { isUnlocked } from '../utils/isUnlocked';
import { invalidateCache } from './Cache';
import { getCloudTrigger } from './Cloud';
import { DocQRL } from './parseQuery';
import { parseResponse } from './parseResponse';

export async function restPostRemove({
  req,
  res,
  docQRL,
}: {
  req: Request;
  res: Response;
  docQRL: DocQRL;
}) {
  const { collection, filter, collection$ } = docQRL;

  const cursor = await collection$.findOneAndUpdate(
    filter || ({} as any),
    { $set: { _expires_at: new Date() } },
    {
      returnDocument: 'after',
      readPreference: 'primary',
    }
  );

  if (cursor.ok && cursor.value) {
    const afterDeletePayload = parseResponse(
      { before: cursor.value, doc: cursor.value, after: null },
      {
        removeSensitiveFields: !isUnlocked(res.locals),
      }
    );
    const afterDelete = getCloudTrigger(collection, 'afterDelete');
    if (afterDelete) {
      afterDelete.fn({
        ...afterDeletePayload,
        qrl: docQRL,
        context: docQRL.options?.context ?? {},
        user: res.locals['session']?.user,
        req,
        res,
      });
    }

    invalidateCache(collection, afterDeletePayload.before);

    return res.status(200).json({});
  }
  if (!cursor.ok) {
    return res
      .status(404)
      .json(
        new EleganteError(
          ErrorCode.REST_DOCUMENT_NOT_FOUND,
          `could not remove ${collection} document.`
        )
      );
  }
  return res.status(200).json({});
}