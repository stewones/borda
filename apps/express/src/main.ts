import http from 'http';
import express from 'express';
import cors from 'cors';

import { init, print, ping, query } from '@elegante/sdk';
import {
  createLiveQueryServer,
  createServer,
  Version,
  ServerEvents,
  memoryUsage,
} from '@elegante/server';

/**
 * server setup
 */

console.time('startup');

const debug = false;
const documentCacheTTL =
  parseFloat(process.env.ELEGANTE_DB_CACHE_TTL ?? '0') || 1 * 1000 * 60 * 60;

const databaseURI =
  process.env.ELEGANTE_DATABASE_URI ||
  'mongodb://localhost:27017/elegante-dev?directConnection=true&serverSelectionTimeoutMS=2000&appName=elegante';
// 'mongodb+srv://parse:Q9SxP1GktfhkdGRE@sandbox.cepvjcf.mongodb.net/sandbox?retryWrites=true&w=majority';

const apiKey = process.env.ELEGANTE_API_KEY || '**elegante**';
const apiSecret = process.env.ELEGANTE_API_SECRET || '**secret**';

const serverMount = process.env.ELEGANTE_SERVER_MOUNT || '/server';

const serverURL = `${
  process.env.ELEGANTE_SERVER_URL || 'http://localhost:1337'
}${serverMount}`;

const serverHeaderPrefix =
  process.env.ELEGANTE_SERVER_HEADER_PREFIX || 'X-Elegante';

/**
 * init elegante sdk
 */

init({
  apiKey,
  apiSecret, // <-- this is optional. only allowed in server.
  serverURL,
  debug,
});

/**
 * spin up an elegante server instance
 */

const elegante = createServer({
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
  /**
   * server operations
   */
  debug,
  documentCacheTTL,
});

/**
 * create the main express app
 */
const server = express();

/**
 * configure cors
 */
server.use(cors());
server.options('*', cors());

/**
 * tell express to mount elegante server on the `/server` path.
 * you can use any path you want.
 */
server.use(serverMount, elegante);

/**
 * elegante server plays 🎮 nicely with any of your existing routes and middlewares
 */
server.get('/', (req, res) => {
  res.status(200).send(`Elegante Server v${Version}`);
});

/**
 * add cloud functions
 */
import './functions';

/**
 * add cloud jobs
 */
import './jobs';

/**
 * add database triggers
 */
import './triggers';

/**
 * start the node server
 */
const httpPort = 1337;
const httpServer = http.createServer(server);
httpServer.listen(httpPort, () => print(`Server running on port ${httpPort}`));

/**
 * start the live query server
 */
const liveQueryPort = 1338;
createLiveQueryServer({
  collections: ['PublicUser', 'Counter'],
  port: liveQueryPort,
  debug: false,
});

/**
 * Listen to LiveQuery connection from server events
 * and do whatever you need after server is ready
 */
ServerEvents.onLiveQueryConnect.subscribe(({ ws, incoming }) => {
  // do whatever you want with websockets here
  // console.log(ws, incoming);
});

/**
 * Listen to database connection from server events
 * and do whatever you need after server is ready
 */
ServerEvents.onDatabaseConnect.subscribe(async ({ db }) => {
  print('Database connected 🚀');
  const stats = await db.stats();
  delete stats['$clusterTime'];
  delete stats['operationTime'];

  console.table(stats);
  console.timeEnd('startup');
  console.time('ping');

  ping()
    .then(() => {
      console.timeEnd('ping');
      console.log('memory', memoryUsage());
    })
    .catch((err) => print(err));
});

/*
{
  "rss": "177.54 MB -> Resident Set Size - total memory allocated for the process execution",
  "heapTotal": "102.3 MB -> total size of the allocated heap",
  "heapUsed": "94.3 MB -> actual memory used during the execution",
  "external": "3.03 MB -> V8 external memory"
}
*/
