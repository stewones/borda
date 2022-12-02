/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  ElegError,
  ErrorCode,
  InternalCollectionName,
  Document,
  DocumentQuery,
} from '@elegante/sdk';

import { Request, Response } from 'express';
import { ElegServer, ServerParams } from './ElegServer';
import { parseDoc, parseDocs } from './parseDoc';
import { parseFilter } from './parseFilter';
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
      const query = {
        filter: {},
        limit: 10000,
        sort: {},
        skip: 0,
        projection: {},
        method: null, // <-- required otherwise we're creating a new document
        options: {},
        join: [],
        ...req.body,
      } as DocumentQuery;

      const { db } = ElegServer;
      const { collectionName } = req.params;
      const {
        filter,
        limit,
        sort,
        projection,
        method,
        options,
        skip,
        pipeline,
      } = query;

      const { allowDiskUse } = options || {};

      const docs: Document[] = [];

      const collection = db.collection<Document>(
        InternalCollectionName[collectionName] ?? collectionName
      );

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
            parseFilter(pipeline),
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
