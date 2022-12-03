/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  ElegError,
  ErrorCode,
  InternalCollectionName,
  Document,
  DocumentQuery,
} from '@elegante/sdk';

import { Request, Response } from 'express';
import { createPipeline } from './createPipeline';
import { ElegServer, ServerParams } from './ElegServer';
import { parseDoc, parseDocs } from './parseDoc';
import { parseFilter } from './parseFilter';
import { parseQuery } from './parseQuery';
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
      const docs: Document[] = [];
      const query = parseQuery(req);
      const {
        filter,
        limit,
        sort,
        projection,
        method,
        options,
        skip,
        pipeline,
        collection,
      } = query;
      const { allowDiskUse } = options || {};

      /**
       * searching for documents
       */
      if (method) {
        /**
         * find/findOne
         */
        if (['find', 'findOne'].includes(method)) {
          const cursor = collection.find<Document>(parseFilter(filter), {
            sort,
            projection,
            ...options,
          });

          if (allowDiskUse) {
            cursor.allowDiskUse(true);
          }

          if (limit) {
            cursor.limit(limit);
          }

          if (skip) {
            cursor.skip(skip);
          }

          await cursor.forEach((doc) => {
            docs.push(doc);
          });

          return res
            .status(200)
            .send(
              method === 'findOne'
                ? await parseDoc(docs[0])(query, params, res.locals)
                : await parseDocs(docs)(query, params, res.locals)
            );
        }

        /**
         * update
         */
        if (method === 'update') {
          const before = await collection.findOne(parseFilter(filter), {
            readPreference: 'primary',
          });
          const cursor = await collection.findOneAndUpdate(
            parseFilter(filter),
            {
              $set: {
                ...(req.body?.doc ?? {}),
                _updated_at: new Date(),
              },
            },
            { returnDocument: 'after', readPreference: 'primary' }
          );

          if (cursor.ok) {
            const after = cursor.value;
            const afterSaveTrigger = parseResponse(
              {
                before,
                after,
                query,
                params,
                locals: res.locals,
              },
              {
                removeSensitiveFields: !isUnlocked(res.locals),
              }
            );
            // @todo run afterSaveTrigger
            return res.status(200).send();
          }

          return Promise.reject(
            new ElegError(
              ErrorCode.REST_DOCUMENT_NOT_UPDATED,
              'could not update document'
            )
          );
        }

        /**
         * delete
         */
        if (method === 'delete') {
          const cursor = await collection.findOneAndUpdate(
            parseFilter(filter),
            { $set: { _deleted_at: new Date() } },
            {
              returnDocument: 'after',
              readPreference: 'primary',
            }
          );

          if (cursor.ok) {
            const afterDeleteTrigger = parseResponse(
              { doc: cursor.value },
              {
                removeSensitiveFields: !isUnlocked(res.locals),
              }
            );
            console.log(afterDeleteTrigger);
            // @todo trigger afterDeleteTrigger
            return res.status(200).send();
          }

          return Promise.reject(
            new ElegError(
              ErrorCode.REST_DOCUMENT_NOT_DELETED,
              cursor.lastErrorObject ?? 'could not delete document'
            )
          );
        }

        /**
         * count
         */
        if (method === 'count') {
          const total = await collection.countDocuments(parseFilter(filter));
          return res.status(200).json(total);
        }

        /**
         * aggregate
         */
        if (method && method === 'aggregate') {
          const cursor = collection.aggregate<Document>(
            createPipeline<Document>({
              filter: filter ?? {},
              pipeline,
              projection: projection ?? {},
              limit: limit ?? 10000,
              skip: skip ?? 0,
            }),
            options
          );

          for await (const doc of cursor) {
            docs.push(doc);
          }

          return res
            .status(200)
            .send(await parseDocs(docs)(query, params, res.locals));
        }
      } else {
        /**
         * creating new documents
         */
        const doc = {
          ...req.body,
          _id: newObjectId(),
          _created_at: new Date(),
          _updated_at: new Date(),
        };
        const cursor = await collection.insertOne(doc);

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
      }
    } catch (err) {
      return res
        .status(500)
        .send(new ElegError(ErrorCode.REST_POST_ERROR, err as object));
    }
  };
}
