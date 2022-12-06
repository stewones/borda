/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  query,
  InternalHeaders,
  Session,
  EleganteError,
  ErrorCode,
  log,
} from '@elegante/sdk';
import { NextFunction, Request, Response } from 'express';
import { CloudFunctionOptions, getCloudFunction } from './Cloud';
import { ServerParams } from './EleganteServer';
import { isUnlocked } from './utils/isUnlocked';

export const routeEnsureApiKey =
  ({ params }: { params: ServerParams }) =>
  (req: Request, res: Response, next: NextFunction) => {
    res.removeHeader('X-Powered-By'); // because why not :)

    const apiKeyHeaderKey = `${params.serverHeaderPrefix}-${InternalHeaders['apiKey']}`;

    if (!req.header(apiKeyHeaderKey?.toLowerCase())) {
      return res.status(400).send('API key required');
    }

    const apiKey = req.header(apiKeyHeaderKey);

    if (apiKey !== params.apiKey) {
      return res.status(401).send('Unauthorized key');
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

/**
 * memoize pointers
 * @todo needs to make a utility for this since it's also same code for parseInclude
 */
const useMemo = true;
type Memo = Map<
  string,
  {
    data: any;
    expires: number;
  }
>;

const memo: Memo = new Map();

/**
 * scheduler for cleaning up memo
 */
setInterval(() => {
  const now = Date.now();
  memo.forEach((value, key) => {
    if (value && now > value.expires) {
      log('removing memo', key);
      memo.delete(key);
    }
  });
}, 1000 * 1);

export const routeHandlePublicFunction =
  (options: CloudFunctionOptions) =>
  (req: Request, res: Response, next: NextFunction) => {
    const { unlocked } = res.locals;
    const { isPublic } = options;

    if (unlocked && !isPublic) {
      delete res.locals['unlocked'];
    }

    return next();
  };

export const routeEnsureAuth =
  ({ params }: { params: ServerParams }) =>
  async (req: Request, res: Response, next: NextFunction) => {
    let isPublicCloudFunction = false;
    if (req.path.startsWith('/functions')) {
      // extract function name from `/functions/:functionName`
      const functionName = req.path.split('/').pop() ?? '';
      const cloudFunction = getCloudFunction(functionName);
      if (cloudFunction && cloudFunction.isPublic) {
        isPublicCloudFunction = true;
      }
    }

    let session: Session | void;
    const token = req.header(
      `${params.serverHeaderPrefix}-${InternalHeaders['apiToken']}`
    );
    const method =
      req.header(
        `${params.serverHeaderPrefix}-${InternalHeaders['apiMethod']}`
      ) ?? '';

    if (token) {
      if (!memo.get(token) || !useMemo) {
        session = await query<Session>('Session')
          .unlock(true)
          .include(['user'])
          .filter({
            token: {
              $eq: token,
            },
            deletedAt: {
              $exists: false,
            },
          })
          .findOne()
          .catch((err) => console.log(err));

        if (session) {
          res.locals['session'] = session;

          // memoize value
          const timeout = params.sessionCacheTTL;

          if (timeout > 0) {
            memo.set(token, {
              data: session,
              expires: Date.now() + timeout,
            });
            log('session is not memoized', token);
          }
        }
      }

      if (memo.get(token) && useMemo) {
        res.locals['session'] = session = memo.get(token)?.data;
        log('session is memoized', token);
      }
    }

    const isUserSpecialRoutes =
      req.params['collectionName'] === 'User' &&
      ['signUp', 'signIn'].includes(method);

    const isSpecialRoutes = isUserSpecialRoutes;
    const isLocked = !isUnlocked(res.locals);

    if (!isSpecialRoutes && !session && isLocked && !isPublicCloudFunction) {
      const err = new EleganteError(ErrorCode.UNAUTHORIZED, 'Unauthorized');
      res.status(401).json(err);
      return;
    }

    return next();
  };
