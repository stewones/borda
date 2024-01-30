import { Response } from 'express';

import {
  Document,
  EleganteError,
  ErrorCode,
  ExternalFieldName,
  InternalFieldName,
  isEmpty,
} from '@elegante/sdk';

import { isUnlocked } from '../utils/isUnlocked';
import { parseDocForInsertion } from './parseDoc';
import { DocQRL } from './parseQuery';

export async function restPostUpdateMany({
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
          ErrorCode.REST_DELETE_ERROR,
          `you must specify a filter to update many ${collection} documents at once`
        )
      );
  }

  const doc: Document = {
    ...(docQRL?.options?.parse?.doc !== false
      ? parseDocForInsertion(docQRL.doc)
      : docQRL.doc),
  };

  if (docQRL?.options?.update?.updatedAt !== false) {
    doc['_updated_at'] =
      doc['_updated_at'] && isUnlocked(res.locals)
        ? doc['_updated_at']
        : new Date();
  }

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

  const cursor = await collection$.updateMany(
    filter || {},
    {
      $set: doc,
    },
    { readPreference: 'primary' }
  );

  if (cursor.acknowledged) {
    return res.status(200).json(cursor);
  } else {
    return Promise.reject(
      new EleganteError(
        ErrorCode.REST_DOCUMENT_NOT_UPDATED,
        `could not update many ${collection} documents`
      )
    );
  }
}
