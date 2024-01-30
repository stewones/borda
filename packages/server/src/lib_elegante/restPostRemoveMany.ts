import {
  Request,
  Response,
} from 'express';

import {
  EleganteError,
  ErrorCode,
  isEmpty,
} from '@elegante/sdk';

import { isUnlocked } from '../utils/isUnlocked';
import { getCloudTrigger } from './Cloud';
import { DocQRL } from './parseQuery';
import { parseResponse } from './parseResponse';

export async function restPostRemoveMany({
  req,
  res,
  docQRL,
}: {
  req: Request;
  res: Response;
  docQRL: DocQRL;
}) {
  const { collection, filter, collection$ } = docQRL;

  if (isEmpty(filter)) {
    return res
      .status(400)
      .json(
        new EleganteError(
          ErrorCode.REST_DELETE_ERROR,
          `you must specify a filter to remove many ${collection} documents at once`
        )
      );
  }

  const updatedDocuments = await collection$
    .find(filter || ({} as any))
    .toArray();

  // console.log(
  //   'restPostRemoveMany.updatedDocuments.total',
  //   updatedDocuments.length
  // );

  const cursor = await collection$.updateMany(
    filter || ({} as any),
    { $set: { _expires_at: new Date() } },
    {
      readPreference: 'primary',
    }
  );

  if (cursor.acknowledged) {
    // now we need to trigger afterDelete hooks
    const afterDelete = getCloudTrigger(collection, 'afterDelete');
    if (afterDelete) {
      updatedDocuments.map((doc) => {
        const afterDeletePayload = parseResponse(
          { before: doc, doc: doc, after: null },
          {
            removeSensitiveFields: !isUnlocked(res.locals),
          }
        );

        afterDelete.fn({
          ...afterDeletePayload,
          qrl: docQRL,
          context: docQRL.options?.context ?? {},
          user: res.locals['session']?.user,
          req,
          res,
        });
      });
    }

    return res.status(200).json(cursor);
  }

  return res
    .status(404)
    .json(
      new EleganteError(
        ErrorCode.REST_DOCUMENT_NOT_FOUND,
        `could not remove many ${collection} documents`
      )
    );
}
