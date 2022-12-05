import express, { Application } from 'express';

import { Db, MongoClient } from 'mongodb';
import { EleganteError, ErrorCode, log, print } from '@elegante/sdk';

import { EleganteServer, ServerEvents, ServerParams } from './EleganteServer';
import { rest } from './rest';
import { Version } from './Version';

/**
 * spin up a new elegante server instance
 *
 * @export
 * @param {ServerParams} options
 * @param {ServerEvents} [events={
 *     onDatabaseConnect: (db: Db) => {},
 *   }]
 * @returns {*}  {Application}
 */
export function createServer(
  options: Partial<ServerParams>,
  events: ServerEvents = {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
    onDatabaseConnect: (db: Db) => {},
  }
): Application {
  const app = (EleganteServer.app = express());
  const { onDatabaseConnect } = events;

  EleganteServer.params = { ...EleganteServer.params, ...options };

  const params = EleganteServer.params;

  rest({
    app,
    params,
  });

  mongoConnect({ params })
    .then((db) => {
      try {
        EleganteServer.db = db;
        createIndexes({ db, params });
        onDatabaseConnect(db);
      } catch (err) {
        print(err);
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
      new EleganteError(ErrorCode.CONNECTION_FAILED, err as object)
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
    const collections = db.listCollections();
    const collectionsArray = await collections.toArray();
    for (const collection of collectionsArray) {
      if (
        collection.type === 'collection' &&
        !collection.name.startsWith('system.')
      ) {
        /**
         * create _expires_at index used for internal soft deletes
         * ie: we don't actually delete the document, we just set _expires_at to a new Date() object
         * representing the TTL. Then mongo will automatically delete the document after the TTL expires
         * so project-wide, we should never directly delete a documentif we want to keep a record of it. ie: hooks like afterDelete
         */
        await db
          .collection(collection.name)
          .createIndex({ _expires_at: 1 }, { expireAfterSeconds: 0 });
      }
    }
    return;
  } catch (err) {
    print(
      `Elegante couldn't create indexes on startup`,
      new EleganteError(ErrorCode.INDEX_CREATION_FAILED, err as object)
    );
  }
}
