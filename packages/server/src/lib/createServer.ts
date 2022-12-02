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
      try {
        ElegServer.db = db;
        createIndexes({ db, params });
        onDatabaseConnect(db);
      } catch (err) {
        console.log(err);
      }
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

export async function createIndexes({
  db,
  params,
}: {
  db: Db;
  params: ServerParams;
}) {
  try {
    /**
     * create _deleted_at index used for internal soft deletes
     * ie: we don't actually delete the document, we just set _deleted_at to a new Date() object
     * representing the TTL. Then mongo will automatically delete the document after the TTL expires
     * so project-wide, we should never directly delete a document
     */
    const collections = db.listCollections();
    const collectionsArray = await collections.toArray();
    for (const collection of collectionsArray) {
      if (
        collection.type === 'collection' &&
        !collection.name.startsWith('system.')
      ) {
        // await db.collection(collection.name).dropIndex('');
        await db
          .collection(collection.name)
          .createIndex({ _deleted_at: 1 }, { expireAfterSeconds: 0 });
      }
    }
    return;
  } catch (err) {
    console.log(
      '\x1b[33m%s\x1b[0m',
      `Elegante couldn't create indexes on startup`,
      new ElegError(ErrorCode.CREATE_INDEX_FAILED, err as object)
    );
  }
}
