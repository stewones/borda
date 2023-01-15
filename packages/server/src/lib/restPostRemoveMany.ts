import {
  Request,
  Response,
} from 'express';

import {
  EleganteError,
  ErrorCode,
  isEmpty,
} from '@elegante/sdk';

import { DocQRL } from './parseQuery';

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

  const cursor = await collection$.updateMany(
    filter ?? {},
    { $set: { _expires_at: new Date() } },
    {
      readPreference: 'primary',
    }
  );

  if (cursor.acknowledged) {
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
