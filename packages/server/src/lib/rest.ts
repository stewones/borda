import cors from 'cors';
import express, { Application, NextFunction, Request, Response } from 'express';

import { ServerParams } from './ElegServer';
import { restGet } from './restGet';
import { restPost } from './restPost';

export function rest({
  app,
  params,
}: {
  app: Application;
  params: ServerParams;
}) {
  app.options('*', cors());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use(
    express.urlencoded({
      extended: true,
      limit: '1mb',
    })
  );

  app.all(
    '/*',
    routeEnsureApiKey({
      params,
    }),
    routeUnlock({
      params,
    })
    /**
     * @todo
     * only logged users can access the API via REST
     * we need to also implement beforeFind, beforeInsert, beforeUpdate, beforeDelete
     * also we need to implement afterFind, afterInsert, afterUpdate, afterDelete
     * attaching the user in session to the request plus the query being made
     * this way users can easily implement their permission system
     */
  );

  app.all(
    '/jobs/*',
    routeEnsureApiSecret({
      params,
    })
  );

  app.get('/ping', (req, res) => res.send('pong')); // for ping

  /**
   * setup rest routes
   */
  app.post(
    '/:collectionName',
    restPost({
      params,
    })
  );

  /**
   * @todo
   * define api
   */
  app.get(
    '/:collectionName/:objectId',
    restGet({
      params,
    })
  );
}

const routeEnsureApiKey =
  ({ params }: { params: ServerParams }) =>
  (req: Request, res: Response, next: NextFunction) => {
    res.removeHeader('X-Powered-By'); // because why not :)

    const apiKeyHeaderKey = `${params.serverHeaderPrefix}-Api-Key`;

    if (!req.header(apiKeyHeaderKey?.toLowerCase())) {
      return res.status(400).send('API key required');
    }

    const apiKey = req.header(apiKeyHeaderKey);

    if (apiKey !== params.apiKey) {
      return res.status(401).send('Unauthorized key');
    }

    return next();
  };

const routeEnsureApiSecret =
  ({ params }: { params: ServerParams }) =>
  (req: Request, res: Response, next: NextFunction) => {
    const apiKeyHeaderKey = `${params.serverHeaderPrefix}-Secret-Key`;

    if (!req.header(apiKeyHeaderKey?.toLowerCase())) {
      return res.status(400).send('Secret key required');
    }

    const apiSecret = req.header(apiKeyHeaderKey);

    if (apiSecret !== params.apiSecret) {
      return res.status(401).send('Unauthorized secret');
    }
    return next();
  };

const routeUnlock =
  ({ params }: { params: ServerParams }) =>
  (req: Request, res: Response, next: NextFunction) => {
    const apiSecret = req.header(`${params.serverHeaderPrefix}-Secret-Key`);

    if (apiSecret === params.apiSecret) {
      res.locals['unlocked'] = true;
    }
    return next();
  };
