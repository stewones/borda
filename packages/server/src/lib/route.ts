/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextFunction, Request, Response } from 'express';

import {
  query,
  InternalHeaders,
  Session,
  EleganteError,
  ErrorCode,
} from '@elegante/sdk';

import { getCloudFunction } from './Cloud';
import { ServerParams } from './Server';
import { Cache } from './Cache';
import { isUnlocked } from './utils/isUnlocked';

export const routeEnsureApiKey =
  ({ params }: { params: ServerParams }) =>
  (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Powered-By', 'Elegante'); // because why not :)

    const apiKeyHeaderKey = `${params.serverHeaderPrefix}-${InternalHeaders['apiKey']}`;

    if (!req.header(apiKeyHeaderKey?.toLowerCase())) {
      return res
        .status(400)
        .json(new EleganteError(ErrorCode.INVALID_API_KEY, 'API key required'));
    }

    const apiKey = req.header(apiKeyHeaderKey);

    if (apiKey !== params.apiKey) {
      return res
        .status(401)
        .json(
          new EleganteError(ErrorCode.UNAUTHORIZED, 'Unauthorized API key')
        );
    }

    return next();
  };

export const routeEnsureApiSecret =
  ({ params }: { params: ServerParams }) =>
  (req: Request, res: Response, next: NextFunction) => {
    const apiKeyHeaderKey = `${params.serverHeaderPrefix}-${InternalHeaders['apiSecret']}`;

    if (!req.header(apiKeyHeaderKey?.toLowerCase())) {
      return res.status(400).send('Secret key required');
    }

    const apiSecret = req.header(apiKeyHeaderKey);

    if (apiSecret !== params.apiSecret) {
      return res.status(401).send('Unauthorized secret');
    }
    return next();
  };

export const routeUnlock =
  ({ params }: { params: ServerParams }) =>
  (req: Request, res: Response, next: NextFunction) => {
    const apiSecret = req.header(
      `${params.serverHeaderPrefix}-${InternalHeaders['apiSecret']}`
    );
    if (apiSecret === params.apiSecret) {
      res.locals['unlocked'] = true;
    }
    return next();
  };

export const routeEnsureAuth =
  ({ params }: { params: ServerParams }) =>
  async (req: Request, res: Response, next: NextFunction) => {
    let isPublicCloudFunction = false;
    let session: Session | void;
    let memo: Session | void;

    const token = req.header(
      `${params.serverHeaderPrefix}-${InternalHeaders['apiToken']}`
    );
    const method =
      req.header(
        `${params.serverHeaderPrefix}-${InternalHeaders['apiMethod']}`
      ) ?? '';

    const isUserSpecialRoutes =
      req.params['collectionName'] === 'User' &&
      ['signUp', 'signIn'].includes(method);

    const isSpecialRoutes = isUserSpecialRoutes;
    const isLocked = !isUnlocked(res.locals);

    if (req.path.startsWith('/functions')) {
      // extract function name from `/functions/:functionName`
      const functionName = req.path.split('/').pop() ?? '';
      const cloudFunction = getCloudFunction(functionName);
      if (cloudFunction && cloudFunction.isPublic) {
        isPublicCloudFunction = true;
      }
    }

    if (token) {
      memo = Cache.get('Session', token);

      if (memo) {
        res.locals['session'] = memo;
        session = memo;
      } else {
        session = await query<Session>('Session')
          .unlock(true)
          .include(['user'])
          .filter({
            token: {
              $eq: token,
            },
            expiresAt: {
              $gt: new Date().toISOString(),
            },
          })
          .findOne()
          .catch((err) => console.log(err));

        if (session) {
          res.locals['session'] = session;
          // cache the session itself
          Cache.set('Session', session.token, session);
          // cache a reference to the session token which belongs to the user
          Cache.set('Session$token', session.user.objectId, {
            token: session.token,
          });
        }
      }
    }

    if (isLocked && !isSpecialRoutes && !session && !isPublicCloudFunction) {
      const err = new EleganteError(ErrorCode.UNAUTHORIZED, 'Unauthorized');
      res.status(401).json(err);
      return;
    }

    return next();
  };
