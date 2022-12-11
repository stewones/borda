```ts

/**
 * server setup
 */
import { createServer, createLiveQueryServer } from '@elegante/server';

const elegante = new createServer({
  databaseURI:
    process.env.ELEGANTE_DATABASE_URI ||
    'mongodb://localhost:27017/elegante-dev',
  apiKey: process.env.ELEGANTE_API_KEY || '**elegante**',
  apiSecret: process.env.ELEGANTE_API_SECRET || '**secret**',
  serverURL: process.env.ELEGANTE_SERVER_URL || 'http://localhost:1337/server',
  serverHeaderPrefix: process.env.ELEGANTE_SERVER_HEADER_ID || 'X-Elegante',
});

const server = express();

server.use('/server', elegante);

const httpServer = http.createServer(server);
httpServer.listen(1337, (port) =>
  console.log('\x1b[33m%s\x1b[0m', `Elegante Server running on port ${port}`)
);

// This will enable the Live Query real-time server
const liveQuery = createLiveQueryServer({
  collections: ['User', 'Etc'],
  websocketTimeout: 5 * 1000,
});

liveQuery.listen(httpServer);

/**
 * queries
 */
import { query } from '@elegante/sdk';

const users =
  (await query) <
  User >
  {
    collection: 'User',
  }
    .projection({
      _id: 0,
      _created_at: 1,
      name: 1,
    })
    .sort({
      _created_at: -1,
    })
    .filter({
      name: {
        $in: ['Raul', 'Elis'],
      },
    })
    .limit(2)
    .skip(0)
    .find({
      allowDiskUse: true,
      readPreference: 'PRIMARY',
    });

console.log(users);

// to update
// returns an array of updated documents
const usersUpdated = await query
  .collection('User')
  .match({
    name: {
      $in: ['Raul', 'Elis'],
    },
  })
  .limit(2)
  .skip(0)
  .allowDiskUse(true)
  .updateOne({
    $set: {
      isActive: true,
    },
  });

console.log(usersUpdated);

/**
 * Pointers
 */
import { pointer } from '@elegante/sdk';

const pointer = pointer('User', 'some-user-id');

const user = await query('Room').insertOne({
  name: 'Room 1',
  owner: pointer,
});

/**
 * Cloud Functions
 */
import { createFunction } from '@elegante/server';

createFunction('hello/:name', (req, res) => {
  res.success(`Hello There! ${req.params.name}`);
});

/**
 * Cloud Jobs
 */
import { createJob, runJob, jobStatus } from '@elegante/server';
// CLI: el job add makeSomeHeavyTask
createJob('makeSomeHeavyTask', (req) => {
  // do some heavy task
  return Promise.resolve('done');
});

// execute a job programatically
// CLI: el job run makeSomeHeavyTask
runJob('makeSomeHeavyTask', {});

// return job status programatically
// CLI: el job status makeSomeHeavyTask
await jobStatus('makeSomeHeavyTask');

/**
 * JS SDK
 *
 * REST Calls are enabled by headers
 *
 * The "X-Elegante" part can be white-labelled
 *
 * X-Elegante-Api-Key: ELEGANTE_SERVER
 * X-Elegante-Secret-Key: ELEGANTE_SECRET
 *
 * Secret is only required to run Cloud Jobs
 *
 * throw ERROR if secretKey is provided in ElegantClient
 */
import { init } from '@elegante/sdk';

const client = init({
  apiKey,
  serverURL: 'http://localhost:1337/server',
  serverHeaderPrefix: 'X-Elegante',
});

client
  .ping()
  .then(() => console.log('Elegante Server connected'))
  .catch((err) => console.log("Can't connect to Elegante Server", err));

/**
 * @todo
 * - Cloud Hooks
 * - Cloud Triggers
 * - JS SDK which runs on node and browser
 * - Pointers
 */

/**
 * example for lock/unlock security
 */
const salesAgg = await query()
  .unlock(true) // only works in the server
  .collection('Sale')
  .include([
    'author',
    'product.author',
    'product.category',
    'product.scrape.scrape',
  ])
  .exclude([
    'count',
    'origin',
    'originId',
    'cumulative',
    'product.content',
    'product.badges',
    'product.tags',
    'product.originLastSync',
    // 'product.author._acl',
    // 'product.author._hashed_password',
    // 'product.author._wperm',
    // 'product.author._rperm',
  ])
  .pipeline([
    {
      $match: {
        createdAt: {
          $gt: '2022-11-28T11:58:37.051Z',
        },
      },
    },
    {
      $addFields: {
        product: {
          $substr: ['$_p_product', 8, -1],
        },
      },
    },
    {
      $lookup: {
        from: 'Product',
        localField: 'product',
        foreignField: '_id',
        as: 'product',
      },
    },
    {
      $unwind: {
        path: '$product',
      },
    },
    {
      $match: {
        'product.name': {
          $regex: 'Real Media Library',
        },
      },
    },
    {
      $limit: 1,
    },
    {
      $unset: ['_p_product'],
    },
  ])
  .aggregate();

// console.log(salesAgg[0].product.author);
```
