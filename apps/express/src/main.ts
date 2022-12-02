import http from 'http';
import express from 'express';

import { createClient, delay, log, query } from '@elegante/sdk';
import {
  createFunction,
  createJob,
  createServer,
  Version,
} from '@elegante/server';

/**
 * server setup
 */
console.time('startup');

/**
 * configure sdk
 */
const databaseURI =
  process.env.ELEGANTE_DATABASE_URI ||
  'mongodb://localhost:27017/elegante-dev?directConnection=true&serverSelectionTimeoutMS=2000&appName=elegante';

const apiKey = process.env.ELEGANTE_API_KEY || 'ELEGANTE_SERVER';
const apiSecret = process.env.ELEGANTE_API_SECRET || 'ELEGANTE_SECRET';

const serverWatchCollections = ['_User', 'Sale'];

const serverMount = process.env.ELEGANTE_SERVER_MOUNT || '/server';

const serverURL = `${
  process.env.ELEGANTE_SERVER_URL || 'http://localhost:3135'
}${serverMount}`;

const serverHeaderPrefix =
  process.env.ELEGANTE_SERVER_HEADER_PREFIX || 'X-Elegante';

const client = createClient({
  apiKey,
  apiSecret,
  serverURL,
  debug: false,
});

/**
 * spin up an Elegante server instance
 */
const elegante = createServer(
  {
    /**
     * mongo connection URI
     */
    databaseURI,
    /**
     * server definitions
     */
    apiKey,
    apiSecret,
    serverURL,
    serverHeaderPrefix,
    // serverWatchCollections,
    /**
     * server operations
     */
    joinCacheTTL: 10 * 1000,
  },
  {
    onDatabaseConnect: async (db) => {
      log('Elegante Server connected to database 🚀');
      const stats = await db.stats();
      delete stats['$clusterTime'];
      delete stats['operationTime'];

      console.table(stats);
      console.timeEnd('startup');

      console.time('ping');
      client.ping().then(() => console.timeEnd('ping'));

      const taskCollection = db.collection('Sale');
      const changeStream = taskCollection.watch();

      changeStream.on('change', (change) => {
        console.log('change', change);
        /**
         *
         * // listen to all changes
         * query.on().subscribe(({ docs, doc, change, before, after }))
         *
         * // listen to enter changes
         * query.on('enter').subscribe(({ docs }))
         *
         * // listen to insert changes
         * query.on('insert').subscribe(({ doc, change}))
         *
         * // listen to update changes
         * query.on('update').subscribe(({ before, after, change}))
         *
         * // listen to delete changes
         * // doc here has only "objectId", so we need to figure out how to deliver the last object
         * query.on('delete').subscribe(({ doc, change}))
         *
         *
         */
      });
    },
  }
);

/**
 * create the main express app
 */
const server = express();

/**
 * tell express to mount Elegante Server instance on the `/server` path
 */
server.use(serverMount, elegante);

/**
 * Elegante Server plays nicely with any of existing routes
 */
server.get('/', (req, res) => {
  res.status(200).send(`Elegante Server v${Version}`);
});

/**
 * add a job
 */
createJob(
  {
    name: 'someHeavyTask',
    path: 'some/inner/:routeParam', // not required
  },
  async (req) => {
    console.log('executing someHeavyTask', 'body', req.params.routeParam || {});
    await delay(10000);
    console.log('someHeavyTask done');
    return Promise.resolve('someHeavyTask done');
  }
);

/**
 * add a cloud function
 */
createFunction(
  {
    name: 'someInnerPublicTask',
    path: 'some/inner/:routeParam', // not required
    isPublic: true, // <-- default to false. a session token must be sent to all /functions/* endpoints
  },
  async (req, res) => {
    console.log('executing', `some/inner/${req.params.routeParam}`);
    await delay(3000);
    console.log(`${req.params.routeParam} done`);
    res.status(200).send(`${req.params.routeParam} done`);
  }
);

/**
 * start the server
 */
const httpPort = 3135;
const httpServer = http.createServer(server);
httpServer.listen(httpPort, () => {
  log(`Elegante Server running on port ${httpPort}`);
});
