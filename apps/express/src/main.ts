import http from 'http';
import express from 'express';

import { createClient, delay, log } from '@elegante/sdk';
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
 * configure client sdk
 * so we can use the same api in the server
 * i.e.
 * import { query } from '@elegante/sdk';
 *
 * const users = await query.collection('User').find();
 *
 */
const client = createClient({
  apiKey: process.env.ELEGANTE_API_KEY || 'ELEGANTE_SERVER',
  apiSecret: process.env.ELEGANTE_API_SECRET || 'ELEGANTE_SECRET',
  serverURL: process.env.ELEGANTE_SERVER_URL || 'http://localhost:3135/server',
});

/**
 * create elegante server instance
 */
const elegante = createServer(
  {
    databaseURI:
      process.env.ELEGANTE_DATABASE_URI ||
      'mongodb://localhost:27017/elegante-dev',
    apiKey: process.env.ELEGANTE_API_KEY || 'ELEGANTE_SERVER',
    apiSecret: process.env.ELEGANTE_API_SECRET || 'ELEGANTE_SECRET',
    serverURL:
      process.env.ELEGANTE_SERVER_URL || 'http://localhost:3135/server',
    serverHeaderPrefix:
      process.env.ELEGANTE_SERVER_HEADER_PREFIX || 'X-Elegante',
  },
  {
    onDatabaseConnect: async (db) => {
      log('Elegante Server connected to database 🚀');
      console.table(await db.stats());
      console.timeEnd('startup');
      console.time('ping');
      client.ping().then(() => console.timeEnd('ping'));
    },
  }
);

/**
 * create your main express app
 */
const server = express();

/**
 * tell express to mount elegante server on the `/server` path
 */
server.use('/server', elegante);

/**
 * Elegante Server plays nicely with any of your routes
 */
server.get('/', (req, res) => {
  res.status(200).send(`Elegante Server v${Version}`);
});

/**
 * add some job
 */
createJob('someHeavyTask', async (req) => {
  console.log('executing someHeavyTask', 'body', req.body || {});
  await delay(10000);
  console.log('someHeavyTask done');
  return Promise.resolve('someHeavyTask done');
});

/**
 * add some cloud function
 */
createFunction('some/inner/:routeParam', async (req, res) => {
  console.log('executing', `some/inner/${req.params.routeParam}`);
  await delay(3000);
  console.log(`${req.params.routeParam} done`);
  res.status(200).send(`${req.params.routeParam} done`);
});

/**
 * start the server
 */
const httpPort = 3135;
const httpServer = http.createServer(server);
httpServer.listen(httpPort, () => {
  log(`Elegante Server running on port ${httpPort}`);
});
