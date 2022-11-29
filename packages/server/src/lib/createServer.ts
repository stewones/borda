import express, { Application, NextFunction, Request, Response } from 'express';
import cors from 'cors';

import { Db, MongoClient } from 'mongodb';
import { ElegError, ErrorCode, log } from '@elegante/sdk';

import { ElegServer } from './ElegServer';
import { routeCollections } from './routeCollections';
import { Version } from './Version';

export interface ServerEvents {
  onDatabaseConnect: (db: Db) => void;
}

export interface ServerParams {
  databaseURI: string;
  apiKey: string;
  apiSecret: string;
  serverURL: string;
  serverHeaderPrefix?: string;
}

export interface ElegServerDefault extends ServerParams {
  events: ServerEvents;
}

const ElegServerDefaultParams: Partial<ElegServerDefault> = {
  serverHeaderPrefix: 'X-Elegante',
  events: {
    // eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
    onDatabaseConnect: (db: Db) => {},
  },
};

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

export async function mongoConnect({ params }: { params: ServerParams }) {
  try {
    const client = new MongoClient(params.databaseURI);
    await client.connect();
    return client.db();
  } catch (err) {
    return Promise.reject(
      new ElegError(ErrorCode.CONNECTION_FAILED, err as object)
    );
  }
}

export function createServer(
  options: ServerParams,
  events: ServerEvents = {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
    onDatabaseConnect: (db: Db) => {},
  }
): Application {
  const app = (ElegServer.app = express());
  const { onDatabaseConnect } = events;

  const params = (ElegServer.params = {
    ...ElegServerDefaultParams,
    ...options,
  });

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
      ElegServer.db = db;
      onDatabaseConnect(db);
    })
    .catch((err) => log(err));

  log(`Elegante Server v${Version}`);
  return app;
}
