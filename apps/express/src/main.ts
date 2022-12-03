import http from 'http';
import express from 'express';
import cors from 'cors';

import { createClient, log } from '@elegante/sdk';
import { createLiveQueryServer, createServer, Version } from '@elegante/server';

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

// const client = createClient({
//   apiKey,
//   apiSecret,
//   serverURL,
//   debug: false,
// });

/**
 * spin up an Elegante server instance
 */
// const elegante = createServer(
//   {
//     /**
//      * mongo connection URI
//      */
//     databaseURI,
//     /**
//      * server definitions
//      */
//     apiKey,
//     apiSecret,
//     serverURL,
//     serverHeaderPrefix,
//     /**
//      * server operations
//      */
//     joinCacheTTL: 10 * 1000,
//   },
//   {
//     onDatabaseConnect: async (db) => {
//       log('Database connected 🚀');
//       const stats = await db.stats();
//       delete stats['$clusterTime'];
//       delete stats['operationTime'];

//       console.table(stats);
//       console.timeEnd('startup');

//       console.time('ping');
//       client.ping().then(() => console.timeEnd('ping'));

//       // const taskCollection = db.collection('Sale');

//       // taskCollection.aggregate([{ $match: { _id: 'kpg5YGSEBn' } }]);

//       // const changeStream = taskCollection.watch([], {
//       //   fullDocument: 'updateLookup',
//       // });

//       // changeStream.on('change', (change) => {
//       //   console.log('change', change);
//       //   /**
//       //    *
//       //    * // listen to all changes
//       //    * query.on().subscribe(({ docs, doc, change, before, after }))
//       //    *
//       //    * // listen to enter changes
//       //    * query.on('enter').subscribe(({ docs }))
//       //    *
//       //    * // listen to insert changes
//       //    * query.on('insert').subscribe(({ doc, change}))
//       //    *
//       //    * // listen to update changes
//       //    * query.on('update').subscribe(({ before, after, change}))
//       //    *
//       //    * // listen to delete changes
//       //    * // doc here has only "objectId", so we need to figure out how to deliver the last object
//       //    * query.on('delete').subscribe(({ doc, change}))
//       //    *
//       //    *
//       //    */
//       // });
//     },
//   }
// );

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
 * tell express to mount Elegante Server instance on the `/server` path
 */
// server.use(serverMount, elegante);

/**
 * Elegante Server plays nicely with any of existing routes
 */
server.get('/', (req, res) => {
  res.status(200).send(`Elegante Server v${Version}`);
});

/**
 * add a job
 */
// import './jobs/someHeavyTask';

// /**
//  * add a cloud function
//  */
// import './functions/someInnerPublicTask';

/**
 * start the server
 */
// const httpPort = 3135;
// const httpServer = http.createServer(server);
// httpServer.listen(httpPort, () => {
//   log(`Server running on port ${httpPort}`);
// });

/**
 * start the live query server
 */
const liveQueryPort = 3136;
// createLiveQueryServer(
//   {
//     collections: ['_User', 'Sale'],
//     port: liveQueryPort,
//   }
//   // {
//   // onLiveQueryConnect: (ws, socket) => {}, // do whatever you want here
//   // }
// );
