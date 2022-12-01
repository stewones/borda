import express, { Application } from 'express';

import { Db, MongoClient } from 'mongodb';
import { ElegError, ErrorCode, log } from '@elegante/sdk';

import { ElegServer, ServerEvents, ServerParams } from './ElegServer';
import { rest } from './rest';
import { Version } from './Version';

export function createServer(
  options: ServerParams,
  events: ServerEvents = {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
    onDatabaseConnect: (db: Db) => {},
  }
): Application {
  const app = (ElegServer.app = express());
  const { onDatabaseConnect } = events;

  ElegServer.params = { ...ElegServer.params, ...options };

  const params = ElegServer.params;

  rest({
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
