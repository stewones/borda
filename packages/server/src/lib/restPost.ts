/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  ElegError,
  ErrorCode,
  Document,
  InternalHeaders,
  QueryMethod,
} from '@elegante/sdk';

import { Request, Response } from 'express';
import { createFindCursor } from './createFindCursor';
import { createPipeline } from './createPipeline';
import { ServerParams } from './ElegServer';
import { parseDoc, parseDocs } from './parseDoc';
import { parseFilter } from './parseFilter';
import { DocQRL, parseQuery } from './parseQuery';
import { parseResponse } from './parseResponse';
import { newObjectId } from './utils/crypto';
import { isUnlocked } from './utils/isUnlocked';

export function restPost({
  params,
}: {
  params: ServerParams;
}): (req: Request, res: Response) => void {
  return async (req: Request, res: Response) => {
    try {
      const method = req.header(
        `${params.serverHeaderPrefix}-${InternalHeaders['apiMethod']}`
      ) as QueryMethod;

      if (!method) {
        throw new ElegError(ErrorCode.REST_METHOD_REQUIRED, 'Method required');
      }

      const collectionName = req.params['collectionName'];
      const query = parseQuery({
        ...req.body,
        collection: collectionName,
      });

      const { filter, collection$ } = query;

      /**
       * find/findOne
       * @todo run beforeFind and afterFind hooks
       */
      if (['find', 'findOne'].includes(method)) {
        const docs = await postFind(query);
        return res
          .status(200)
          .send(
            method === 'findOne'
              ? await parseDoc(docs[0])(query, params, res.locals)
              : await parseDocs(docs)(query, params, res.locals)
          );
      } else if (method === 'update') {
        /**
         * update
         * @todo run beforeUpdate and afterUpdate hooks
         */
        const { cursor, before } = await postUpdate(query);
        if (cursor.ok) {
          const after = cursor.value;
          const afterSaveTrigger = parseResponse(
            {
              before,
              after,
            },
            {
              removeSensitiveFields: !isUnlocked(res.locals),
            }
          );
          //
          // more values to be added
          //   query,
          //  params,
          //  locals: res.locals,

          // @todo run afterSaveTrigger
          return res.status(200).send();
        }

        return Promise.reject(
          new ElegError(
            ErrorCode.REST_DOCUMENT_NOT_UPDATED,
            'could not update document'
          )
        );
      } else if (method === 'delete') {
        /**
         * delete
         * @todo run beforeDeleteTrigger and afterDeleteTrigger
         */
        const { cursor } = await postDelete(query);

        if (cursor.ok) {
          const afterDeleteTrigger = parseResponse(
            { doc: cursor.value },
            {
              removeSensitiveFields: !isUnlocked(res.locals),
            }
          );
          // console.log(afterDeleteTrigger);
          // @todo trigger afterDeleteTrigger
          return res.status(200).send();
        }

        return Promise.reject(
          new ElegError(
            ErrorCode.REST_DOCUMENT_NOT_DELETED,
            cursor.lastErrorObject ?? 'could not delete document'
          )
        );
      } else if (method === 'count') {
        /**
         * count
         * @todo run beforeCount and afterCount triggers
         */
        const total = await collection$.countDocuments(parseFilter(filter));
        return res.status(200).json(total);
      } else if (method && method === 'aggregate') {
        /**
         * aggregate
         * @todo run beforeAggregate and afterAggregate triggers
         */
        const docs = await postAggregate(query);
        return res
          .status(200)
          .send(await parseDocs(docs)(query, params, res.locals));
      } else if (method === 'insert') {
        /**
         * insert new documents
         * @todo run beforeInsert and afterInsert triggers
         */
        const doc = {
          ...req.body,
          _id: newObjectId(),
          _created_at: new Date(),
          _updated_at: new Date(),
        };
        const cursor = await collection$.insertOne(doc);

        if (cursor.acknowledged) {
          const afterSaveTrigger = parseResponse(
            { before: null, after: doc },
            {
              removeSensitiveFields: !isUnlocked(res.locals),
            }
          );
          // @todo run afterSaveTrigger
          return res.status(201).send(doc);
        }

        return Promise.reject(
          new ElegError(
            ErrorCode.REST_DOCUMENT_NOT_CREATED,
            'could not create document'
          )
        );
      } else if (collectionName === 'User' && method === 'signUp') {
        /**
         * user sign up
         */
        postSignup(query);
      } else {
        throw new ElegError(
          ErrorCode.REST_METHOD_NOT_FOUND,
          'Method not found'
        );
      }
    } catch (err) {
      return res
        .status(500)
        .send(new ElegError(ErrorCode.REST_POST_ERROR, err as object));
    }
  };
}

async function postFind(query: DocQRL) {
  const docs: Document[] = [];
  const cursor = createFindCursor(query);
  await cursor.forEach((doc) => {
    docs.push(doc);
  });
  return docs;
}

async function postUpdate(query: DocQRL) {
  const { filter, collection$, doc } = query;

  const before = await collection$.findOne(parseFilter(filter), {
    readPreference: 'primary',
  });

  const cursor = await collection$.findOneAndUpdate(
    parseFilter(filter),
    {
      $set: {
        ...(doc ?? {}),
        _updated_at: new Date(),
      },
    },
    { returnDocument: 'after', readPreference: 'primary' }
  );

  return {
    before,
    cursor,
  };
}

async function postDelete(query: DocQRL) {
  const { filter, collection$ } = query;

  const cursor = await collection$.findOneAndUpdate(
    parseFilter(filter),
    { $set: { _deleted_at: new Date() } },
    {
      returnDocument: 'after',
      readPreference: 'primary',
    }
  );

  return {
    cursor,
  };
}

async function postAggregate(query: DocQRL) {
  const {
    collection$,
    pipeline,
    projection,
    filter,
    limit,
    skip,
    sort,
    options,
  } = query;

  const docs: Document[] = [];

  const cursor = collection$.aggregate<Document>(
    createPipeline<Document>({
      filter: filter ?? {},
      pipeline,
      projection: projection ?? {},
      limit: limit ?? 10000,
      skip: skip ?? 0,
      sort: sort ?? {},
    }),
    options
  );

  for await (const doc of cursor) {
    docs.push(doc);
  }

  return docs;
}

async function postSignup(query: DocQRL) {}
