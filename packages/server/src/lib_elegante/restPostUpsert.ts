import { Response } from 'express';

import {
  Document,
  EleganteError,
  ErrorCode,
  ExternalFieldName,
  InternalFieldName,
  isEmpty,
} from '@elegante/sdk';

import { newObjectId } from '../utils';
import { isUnlocked } from '../utils/isUnlocked';
import { parseDocForInsertion } from './parseDoc';
import { DocQRL } from './parseQuery';

export async function restPostUpsert({
  res,
  docQRL,
}: {
  res: Response;
  docQRL: DocQRL;
}) {
  const { collection$, collection, filter } = docQRL;

  if (isEmpty(filter)) {
    return res
      .status(400)
      .json(
        new EleganteError(
          ErrorCode.REST_POST_ERROR,
          `you must specify a filter to update or insert ${collection} document`
        )
      );
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

  const bulk = collection$.initializeUnorderedBulkOp({
    readPreference: 'primary',
  });

  bulk
    .find(filter ?? {})
    .upsert()
    .updateOne({
      $setOnInsert: { _id: newObjectId(), _created_at: new Date() },
      $set: doc,
    });

  const cursor = await bulk.execute();

  if (cursor.ok) {
    return res.status(200).json(cursor);
  } else {
    return Promise.reject(
      new EleganteError(
        ErrorCode.REST_DOCUMENT_NOT_UPDATED,
        `could not update or insert ${collection} document`
      )
    );
  }
}
