import { Response } from 'express';

import {
  Document,
  EleganteError,
  ErrorCode,
  ExternalFieldName,
  InternalFieldName,
  isEmpty,
} from '@elegante/sdk';

import { parseDocForInsertion } from './parseDoc';
import { DocQRL } from './parseQuery';
import { newObjectId } from './utils';
import { isUnlocked } from './utils/isUnlocked';

export async function restPostUpsertMany({
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
          `you must specify a filter to update or insert many ${collection} documents at once. the value should be prefixed with $$ + the field to be compared to identify the field to update. eg: { email: $$email }`
        )
      );
  }

  if (!Array.isArray(docQRL.docs)) {
    return res
      .status(400)
      .json(
        new EleganteError(
          ErrorCode.REST_POST_ERROR,
          `you must specify an array of documents to update or insert many ${collection} documents at once`
        )
      );
  }

  const docs: Document[] = docQRL.docs.map((doc) => ({
    ...parseDocForInsertion(doc),
    _updated_at: new Date(),
  }));

  /**
   * ensure each internal/external field is deleted from the user payload
   * if session is not unlocked
   */
  const reservedFields = [
    ...Object.keys(InternalFieldName),
    ...Object.keys(ExternalFieldName),
  ];

  if (!isUnlocked(res.locals)) {
    docs.forEach((doc) => {
      reservedFields.forEach((field) => {
        delete doc[field];
      });
    });
  }

  const bulk = collection$.initializeUnorderedBulkOp({
    readPreference: 'primary',
  });

  docs.forEach((doc) => {
    // create a condition based on the filter
    // if a filter has a value with $$ prefix, it means we want to compare the value of the field with the value of the field specified in the filter
    // eg: { email: $$email } means we want to compare the value of the email field with the value of the email field in the filter
    const filterPayload: any = filter;
    const condition = Object.keys(filterPayload).reduce(
      (acc: any, key: string) => {
        if (
          typeof filterPayload[key] === 'string' &&
          filterPayload[key].startsWith('$$')
        ) {
          acc[key] = doc[filterPayload[key].slice(2)];
        } else {
          acc[key] = filterPayload[key];
        }
        return acc;
      },
      {}
    );

    bulk
      .find(condition)
      .upsert()
      .updateOne({
        $setOnInsert: {
          _id: newObjectId(),
          _created_at: new Date(),
        },
        $set: doc,
      });
  });

  const cursor = await bulk.execute();

  if (cursor.ok) {
    return res.status(200).json(cursor);
  } else {
    return Promise.reject(
      new EleganteError(
        ErrorCode.REST_DOCUMENT_NOT_UPDATED,
        `could not update or insert many ${collection} documents`
      )
    );
  }
}
