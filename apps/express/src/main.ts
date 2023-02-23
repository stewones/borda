import http from 'http';
import express from 'express';
import cors from 'cors';

import { init, print, ping } from '@elegante/sdk';
import {
  createLiveQueryServer,
  createServer,
  Version,
  ServerEvents,
  memoryUsage,
} from '@elegante/server';

import { passwordResetGet, passwordResetPost } from './routes/passwordReset';
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
  // uncomment to implement your own plugins
  // plugins: [
  //   {
  //     name: 'MyCustomEmailProvider',
  //     version: '0.0.0',
  //     EmailProvider() {
  //       return {
  //         send(params: { to: string; subject: string; html: string }) {
  //           print(`
  //             -------------------
  //             Email Provider Test
  //             -------------------
  //             # to: ${params.to}
  //             # subject: ${params.subject}
  //             # html: ${params.html}
  //           `);
  //           return Promise.resolve();
  //         },
  //       };
  //     },
  //   },
  //   {
  //     name: 'MyCustomEmailPasswordResetTemplate',
  //     version: '0.0.0',
  //     EmailPasswordResetTemplate({ token, user, baseUrl }) {
  //       return {
  //         subject: 'Custom Password Reset',
  //         html: `
  //             <p>Hello ${user.name},</p>
  //             <p>Here is your password reset link:</p>
  //             <p>${baseUrl}/password/reset?token=${token}</p>
  //             <br />
  //             <br />
  //             <p>Best,</p>
  //             <p>Elegante.</p>
  //         `,
  //       };
  //     },
  //   },
  // ],
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
 * parse json and url
 */
server.use(express.json({ limit: '1mb' }));
server.use(
  express.urlencoded({
    extended: true,
    limit: '1mb',
  })
);

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
server.get('/password/reset', passwordResetGet);
server.post('/password/reset', passwordResetPost);

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
