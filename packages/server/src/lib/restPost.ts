/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

import { Request, Response } from 'express';

import {
  EleganteError,
  ErrorCode,
  ExternalCollectionName,
  InternalCollectionName,
  InternalHeaders,
  QueryMethod,
} from '@elegante/sdk';

import { DocQRLFrom, parseQuery } from './parseQuery';
import { restPostAggregate } from './restPostAggregate';
import { restPostCount } from './restPostCount';
import { restPostFind } from './restPostFind';
import { restPostInsert } from './restPostInsert';
import { restPostInsertMany } from './restPostInsertMany';
import { restPostPasswordForgot } from './restPostPasswordForgot';
import { restPostPasswordReset } from './restPostPasswordReset';
import { restPostRemove } from './restPostRemove';
import { restPostRemoveMany } from './restPostRemoveMany';
import { restPostSignIn } from './restPostSignIn';
import { restPostSignUp } from './restPostSignUp';
import { restPostUpdate } from './restPostUpdate';
import { restPostUpdateEmail } from './restPostUpdateEmail';
import { restPostUpdateMany } from './restPostUpdateMany';
import { restPostUpdatePassword } from './restPostUpdatePassword';
import { restPostUpsert } from './restPostUpsert';
import { restPostUpsertMany } from './restPostUpsertMany';
import { ServerParams } from './Server';
import { isUnlocked } from './utils/isUnlocked';

export function restPost({
  params,
}: {
  params: ServerParams;
}): (req: Request, res: Response) => void {
  return (req: Request, res: Response) => {
    try {
      const collectionName =
        InternalCollectionName[req.params['collectionName']] ??
        req.params['collectionName'];

      const method = req.header(
        `${params.serverHeaderPrefix}-${InternalHeaders['apiMethod']}`
      ) as QueryMethod;

      if (!method) {
        throw new EleganteError(
          ErrorCode.REST_METHOD_REQUIRED,
          'Method required'
        );
      }

      /**
       * query against to any of the reserved collections
       * if not unlocked should be strictly forbidden
       */
      const reservedCollections = [
        ...Object.keys(InternalCollectionName),
        ...Object.keys(ExternalCollectionName),
      ];

      if (
        ![
          'signIn',
          'signUp',
          'updateEmail',
          'updatePassword',
          'passwordForgot',
          'passwordReset',
        ].includes(method) &&
        !isUnlocked(res.locals) &&
        reservedCollections.includes(collectionName)
      ) {
        return res
          .status(405)
          .json(
            new EleganteError(
              ErrorCode.QUERY_NOT_ALLOWED,
              `You can't execute the operation '${method}' on '${
                ExternalCollectionName[collectionName] ?? collectionName
              }' because it's a reserved collection`
            )
          );
      }

      const docQRLFrom: DocQRLFrom = {
        ...req.body,
        res,
        method,
        collection: collectionName,
      };

      const docQRL = parseQuery(docQRLFrom);

      if (['find', 'findOne'].includes(method)) {
        return restPostFind({
          docQRL,
          res,
          method,
          params,
        });
      } else if (method === 'update') {
        return restPostUpdate({
          req,
          res,
          docQRL,
        });
      } else if (method === 'updateMany') {
        return restPostUpdateMany({
          res,
          docQRL,
        });
      } else if (method === 'remove') {
        return restPostRemove({
          req,
          res,
          docQRL,
        });
      } else if (method === 'removeMany') {
        return restPostRemoveMany({
          req,
          res,
          docQRL,
        });
      } else if (method === 'count') {
        return restPostCount({ res, docQRL });
      } else if (method === 'aggregate') {
        return restPostAggregate({
          res,
          params,
          docQRL,
        });
      } else if (method === 'insert') {
        return restPostInsert({
          req,
          res,
          docQRL,
        });
      } else if (method === 'upsert') {
        return restPostUpsert({
          //req,
          res,
          docQRL,
        });
      } else if (method === 'insertMany') {
        return restPostInsertMany({
          req,
          res,
          docQRL,
        });
      } else if (method === 'upsertMany') {
        return restPostUpsertMany({
          //req,
          res,
          docQRL,
        });
      } else if (collectionName === '_User' && method === 'signUp') {
        return restPostSignUp({
          res,
          req,
          docQRL,
        });
      } else if (collectionName === '_User' && method === 'signIn') {
        return restPostSignIn({
          res,
          docQRL,
        });
      } else if (collectionName === '_User' && method === 'updateEmail') {
        return restPostUpdateEmail({
          res,
          docQRL,
        });
      } else if (collectionName === '_User' && method === 'updatePassword') {
        return restPostUpdatePassword({
          res,
          docQRL,
        });
      } else if (collectionName === '_User' && method === 'passwordForgot') {
        return restPostPasswordForgot({
          res,
          docQRL,
        });
      } else if (collectionName === '_User' && method === 'passwordReset') {
        return restPostPasswordReset({
          res,
          docQRL,
        });
      } else {
        throw new EleganteError(
          ErrorCode.REST_METHOD_NOT_FOUND,
          'Method not found'
        );
      }
    } catch (err) {
      return res
        .status(405)
        .json(
          new EleganteError(ErrorCode.REST_POST_ERROR, err as object).toJSON()
        );
    }
  };
}
