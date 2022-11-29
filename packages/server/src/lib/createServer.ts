import express, { Application, NextFunction, Request, Response } from 'express';

import { Db, MongoClient } from 'mongodb';
import { EleganteError, ErrorCode, log } from '@elegante/sdk';

import { EleganteServer } from './EleganteServer';
import { routeCollections } from './routeCollections';
import { Version } from './Version';

export interface EleganteServerEvents {
  onDatabaseConnect: (db: Db) => void;
}

export interface EleganteServerParams {
  databaseURI: string;
  apiKey: string;
  apiSecret: string;
  serverURL: string;
  serverHeaderPrefix?: string;
}

export interface EleganteServerDefault extends EleganteServerParams {
  events: EleganteServerEvents;
}

const EleganteServerDefaultParams: Partial<EleganteServerDefault> = {
  serverHeaderPrefix: 'X-Elegante',
  events: {
    // eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
    onDatabaseConnect: (db: Db) => {},
  },
};

const routeEnsureApiKey =
  ({ params }: { params: EleganteServerParams }) =>
  (req: Request, res: Response, next: NextFunction) => {
    const apiKey =
      (req.headers[
        `${params.serverHeaderPrefix?.toLowerCase()}-api-key`
      ] as string) || '';

    if (!apiKey || apiKey !== params.apiKey) {
      return res.status(401).send('Unauthorized key');
    }
    return next();
  };

const routeEnsureApiSecret =
  ({ params }: { params: EleganteServerParams }) =>
  (req: Request, res: Response, next: NextFunction) => {
    const apiSecret = req.headers[
      `${params.serverHeaderPrefix?.toLowerCase()}-api-secret`
    ] as string;

    if (apiSecret !== params.apiSecret) {
      return res.status(401).send('Unauthorized secret');
    }
    return next();
  };

const routeUnlock =
  ({ params }: { params: EleganteServerParams }) =>
  (req: Request, res: Response, next: NextFunction) => {
    const apiSecret = req.headers[`${params.serverHeaderPrefix}-Api-Secret`];

    if (apiSecret === params.apiSecret) {
      res.locals['unlocked'] = true;
    }
    return next();
  };

async function mongoConnect({ params }: { params: EleganteServerParams }) {
  try {
    const client = new MongoClient(params.databaseURI);
    await client.connect();
    return client.db();
  } catch (err) {
    return Promise.reject(new EleganteError(ErrorCode.CONNECTION_FAILED, err));
  }
}

export function createServer(
  options: EleganteServerParams,
  events: EleganteServerEvents = {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
    onDatabaseConnect: (db: Db) => {},
  }
): Application {
  const app = (EleganteServer.app = express());
  const { onDatabaseConnect } = events;

  const params = (EleganteServer.params = {
    ...EleganteServerDefaultParams,
    ...options,
  });

  app.all(
    '/*',
    routeEnsureApiKey({
      params,
    }),
    routeUnlock({
      params,
    })
  );

  app.all(
    '/jobs/*',
    routeEnsureApiSecret({
      params,
    })
  );

  app.get('/ping', (req, res) => res.send('pong'));

  routeCollections({
    app,
    params,
  });

  mongoConnect({ params })
    .then((db) => {
      EleganteServer.db = db;
      onDatabaseConnect(db);
    })
    .catch((err) => log(err));

  log(`Elegante Server v${Version} started`);
  return app;
}
