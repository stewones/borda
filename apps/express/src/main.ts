import http from 'http';
import express from 'express';

import { createClient, log } from '@elegante/sdk';
import { createLiveQueryServer, createServer, Version } from '@elegante/server';

// import WebSocket from 'ws';
// const wss = new WebSocket.Server({ port: 1337 });
// const clients = new Map();

// wss.on('connection', (ws) => {
//   const id = newObjectId();
//   const color = Math.floor(Math.random() * 360);
//   const metadata = { id, color };
//   clients.set(ws, metadata);

//   ws.on('message', (messageAsString: string) => {
//     const message = JSON.parse(messageAsString);
//     const metadata = clients.get(ws);

//     message.sender = metadata.id;
//     message.color = metadata.color;

//     const outbound = JSON.stringify(message);

//     [...clients.keys()].forEach((client) => {
//       client.send(outbound);
//     });
//   });

//   ws.on('close', () => {
//     clients.delete(ws);
//   });
// });

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
  debug: true,
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
    /**
     * server operations
     */
    joinCacheTTL: 10 * 1000,
  },
  {
    onDatabaseConnect: async (db) => {
      log('Database connected 🚀');
      const stats = await db.stats();
      delete stats['$clusterTime'];
      delete stats['operationTime'];

      console.table(stats);
      console.timeEnd('startup');

      console.time('ping');
      client.ping().then(() => console.timeEnd('ping'));

      const taskCollection = db.collection('Sale');
      const changeStream = taskCollection.watch([], {
        fullDocument: 'updateLookup',
      });

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
import './jobs/someHeavyTask';

/**
 * add a cloud function
 */
import './functions/someInnerPublicTask';

/**
 * start the server
 */
const httpPort = 3135;
const httpServer = http.createServer(server);
httpServer.listen(httpPort, () => {
  log(`Server running on port ${httpPort}`);
});

/**
 * start the live query server
 */
createLiveQueryServer(
  {
    collections: ['_User', 'Sale'],
    port: 3136,
  },
  {
    onLiveQueryConnect: (ws, socket, request, clients) => {
      const metadata = clients.get(ws);
      log('livemeta', metadata);
    },
  }
);
