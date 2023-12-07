import http from 'http';
import express from 'express';
import cors from 'cors';

import { init, print, ping, query, pointer } from '@elegante/sdk';
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

const debug = true;
const documentCacheTTL =
  parseFloat(process.env.ELEGANTE_DB_CACHE_TTL ?? '0') || 1 * 1000 * 60 * 60;

const databaseURI =
  process.env.ELEGANTE_DATABASE_URI ||
  'mongodb://127.0.0.1:27017/elegante-dev?directConnection=true&serverSelectionTimeoutMS=2000&appName=elegante';
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

/**
 * start the live query server
 */
const liveQueryPort = 1338;
createLiveQueryServer({
  httpServer,
  collections: ['PublicUser', 'Counter'],
  // reservedCollections: [],
  port: liveQueryPort,
  debug,
  upgrade: true,
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

  // upsert needs more thought
  // const res = await query('UpdateTest')
  //   .unlock()
  //   // .filter({
  //   //   active: false,
  //   // })
  //   .upsertMany({ name: 'tester1', active: false })
  //   .catch((err) => print(err));
  // console.log(res);

  // await query('UpdateTest')
  //   .unlock()
  //   // .filter({
  //   //   objectId: 'asdf',
  //   // })
  //   .update(
  //     'asdf',
  //     {
  //       title: 'Chatness Articles',
  //       url: 'https://chatness.app/articles',
  //       language: 'en',
  //       topics: [
  //         'chatbot technology',
  //         'ai',
  //         'customer service',
  //         'sales',
  //         'self-hosted chatbot platforms',
  //         'industry-specific use cases',
  //         'integrating chatbots to websites',
  //         'benefits of self-hosted chatbot platforms',
  //       ],
  //       context:
  //         'The Chatbot Revolution: How Businesses are Streamlining Customer Service and Sales with AI\n\nExplore the latest trends and strategies in chatbot technology and discover how businesses are leveraging AI to improve customer service and boost sales. From self-hosted chatbot platforms to industry-specific use cases, our expert insights and case studies will help you stay ahead of the curve in the chatbot revolution.\n\nHow to integrate a chatbot to your website\n\nIn this article, we will show you how to integrate an AI chatbot to your website using Chatness, a user-friendly and efficient AI Chatbot Platform to allow your users chat with bots\n\nWhy Use a Self-Hosted Chatbot Platform for Your Business?\n\nIn this article, we explore why businesses are turning to chatbots to streamline their customer service operations and boost sales. We discuss the limitations of traditional chatbot platforms and how self-hosted chatbot platforms like Chatness can help businesses overcome these limitations.',
  //       source: 'website',
  //       qa: [
  //         {
  //           question: 'How can I integrate a chatbot to my website?',
  //           answer:
  //             "To integrate an AI chatbot to your website, you can use Chatness, a user-friendly and efficient AI Chatbot Platform that allows your users to chat with bots. You can follow the steps mentioned in the article 'How to integrate a chatbot to your website' for detailed instructions.",
  //         },
  //         {
  //           question:
  //             'Why should businesses use a self-hosted chatbot platform?',
  //           answer:
  //             "Businesses are turning to self-hosted chatbot platforms like Chatness to streamline their customer service operations and boost sales. These platforms offer advantages over traditional chatbot platforms, such as overcoming limitations and providing more control and customization options. You can learn more about the benefits in the article 'Why Use a Self-Hosted Chatbot Platform for Your Business?'",
  //         },
  //       ],
  //       locked: true,
  //     },
  //     { inspect: true }
  //   )
  //   .catch((err) => print(err));

  // tests
  // await query('Analytic')
  //   .unlock()
  //   .filter({
  //     '_metadata._p_user': pointer('User', '4oiXABfGkj'),
  //   })
  //   .updateMany(
  //     { '_metadata._p_user': pointer('User', '4oiXABfGkjj') },
  //     {
  //       inspect: true,
  //       update: {
  //         updatedAt: false,
  //       },
  //       parse: {
  //         doc: false,
  //       },
  //     }
  //   )
  //   .then(() => console.log('yahoo'))
  //   .catch((err) => console.log(err));

  await query('UpsertMethodTest')
    .unlock()
    .filter({
      email: '$$email',
    })
    .upsertMany([
      { name: 'John Doe', email: 'john@doe.com' },
      {
        name: 'Jane Doe',
        email: 'jane@doe.com',
      },
      {
        name: 'Yellow Musk',
        email: 'yellow@musk.com',
      },
    ])
    .then(() => console.log('yahoo'))
    .catch((err) => console.log(err));
});

httpServer.listen(httpPort, () => print(`Server running on port ${httpPort}`));
