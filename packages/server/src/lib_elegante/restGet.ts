/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

import { Request, Response } from 'express';

import {
  Document,
  EleganteError,
  ErrorCode,
  ExternalCollectionName,
  InternalCollectionName,
} from '@elegante/sdk';

import { isUnlocked } from '../utils/isUnlocked';
import { parseDoc } from './parseDoc';
import { parseProjection } from './parseProjection';
import { DocQRLFrom, parseQuery } from './parseQuery';
import { ServerParams } from './Server';

export function restGet({
  params,
}: {
  params: ServerParams;
}): (req: Request, res: Response) => void {
  return async (req: Request, res: Response) => {
    try {
      const { collectionName, objectId } = req.params;

      /**
       * query against to any of the reserved collections
       * if not unlocked should be strictly forbidden
       */
      const reservedCollections = [
        ...Object.keys(InternalCollectionName),
        ...Object.keys(ExternalCollectionName),
      ];
      if (
        !isUnlocked(res.locals) &&
        reservedCollections.includes(collectionName)
      ) {
        return res
          .status(405)
          .json(
            new EleganteError(
              ErrorCode.QUERY_NOT_ALLOWED,
              `You can't execute the operation 'get' on '${
                ExternalCollectionName[collectionName] ?? collectionName
              }' because it's a reserved collection`
            )
          );
      }

      /**
       * @todo run beforeFind and afterFind hooks
       */
      const docQRLFrom: DocQRLFrom = {
        ...req.body,
        include: req.query['include'],
        exclude: req.query['exclude'],
        collection: collectionName,
      };

      const docQRL = parseQuery(docQRLFrom);

      const { collection$ } = docQRL;

      const doc = await collection$.findOne<Document>({
        _id: objectId as any,
      });

      return res
        .status(200)
        .send(
          parseProjection(
            docQRL.projection ?? {},
            await parseDoc(doc)(docQRL, params, res.locals)
          )
        );
    } catch (err) {
      return res
        .status(500)
        .json(
          new EleganteError(ErrorCode.REST_GET_ERROR, err as object).toJSON()
        );
    }
  };
}
