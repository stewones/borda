/**
 * This is a compreehensive example of how to use Borda on an Elysia server
 * Checkout the `quick.ts` file for a minimal example
 *
 * It includes:
 *
 * - a borda server
 * - some database hooks
 * - some server functions
 * - some custom routes (reset User's password)
 * - some query tests for both client and server instances
 * - a custom email provider plugin
 * - a custom email password reset template plugin
 */
import {
  Elysia,
  t,
} from 'elysia';

import {
  BordaServer,
  Instant,
} from '@borda/server';

import {
  CloudSchema,
  SyncSchema,
} from '@/common';
import { cors } from '@elysiajs/cors';
import { html } from '@elysiajs/html';

import {
  passwordResetGet,
  passwordResetPost,
} from './routes/password';
import {
  afterDeletePublicUser,
  afterSaveUser,
  beforeSaveUser,
  beforeSignUp,
} from './triggers';

/**
 * instantiate and export the borda server
 * its instance is the client you should use
 */
export const borda = new BordaServer({
  name: 'borda-on-elysia',
  inspect: false,
  cacheTTL: 1000 * 1 * 60 * 60,
  liveCollections: ['Counter', 'PublicUser'],
  reservedCollections: ['_User', '_Password', '_Session'],
  plugins: [
    {
      name: 'my-email-provider',
      version: '0.0.0',
      EmailProvider() {
        return {
          send(params: {
            to: { name: string; email: string };
            subject: string;
            html: string;
          }) {
            console.log(`
              -------------------
              @todo implement your own email provider
              -------------------
              # to: ${params.to.name} <${params.to.email}>
              # subject: ${params.subject}
              # html: ${params.html}
            `);
            return Promise.resolve();
          },
        };
      },
    },
    {
      name: 'my-password-reset-template',
      version: '0.0.0',
      EmailPasswordResetTemplate({ token, user, baseUrl, request }) {
        return {
          subject: 'Custom Password Reset',
          html: `
              <p>Hello ${user.name},</p>
              <p>Here is your password reset link:</p>
              <p>${baseUrl}/password/reset?token=${token}</p>
              <br />
              <br />
              <p>Best,</p>
              <p>Your Co.</p>
          `,
        };
      },
    },
  ],
});

/**
 * Attach the borda instance to the Instant class
 */
const insta = new Instant({
  schema: SyncSchema,
  cloud: CloudSchema,
  inspect: true,
  size: parseInt(process.env['INSTANT_SIZE'] || '1_000'),
  // set constraints to restrict broadcast and filtered data
  // constraints: [
  //   {
  //     key: 'org',
  //     collection: 'orgs',
  //   },
  // ],
});

await insta.ready();

// custom route params schema
// const SyncParamsSchema = Instant.SyncParamsSchema(insta.collections);
// const SyncMutationParamsSchema = Instant.SyncMutationParamsSchema(
//   insta.collections
// );

// custom query schema
// const SyncBatchQueryCustomSchema = t.Object({
//   ...Instant.SyncBatchQuery,
//   //org: t.String(), // can also be multiple orgs split by comma
// });

// custom mutation query schema
// const SyncMutationQueryCustomSchema = t.Object({
//   // org: t.String(), // can also be multiple orgs split by comma
// });

// custom headers schema
// const SyncHeadersCustomSchema = t.Object({
//   ...Instant.SyncHeaders,
//   // another custom header
//   //someCustomHeaderParam: t.Optional(t.String()),
// });

// custom live query schema
const SyncLiveQueryOrgSchema = t.Object({
  ...Instant.SyncLiveQuery,
  // org: t.String(), // can also be multiple orgs split by comma - the key must be a pointer mapped in the constraints
});

/**
 * attach some database hooks
 */
borda.cloud.beforeSignUp(beforeSignUp);
borda.cloud.beforeSave('User', beforeSaveUser);
borda.cloud.afterSave('User', afterSaveUser);
borda.cloud.afterDelete('PublicUser', afterDeletePublicUser);

/**
 * attach some server functions with full type safety
 */
insta.cloud.addFunction('login', async ({ body, headers }) => {
  console.log('body', body);
  console.log('headers', headers); // expected to be unknown

  // expects a token to be returned
  return {
    token: '1234567890',
  };
});

insta.cloud.addFunction('logout', async ({ headers }) => {
  console.log('headers', headers); // expected authorization header to be used

  // doesn't expect anything to be returned
});

// borda.cloud.addFunction(getCounter, {
//   public: true,
// });
// borda.cloud.addFunction(getPublicUsers, {
//   public: true,
// });
// borda.cloud.addFunction(increaseCounter, {
//   public: true,
// });

// runLiveQueryTest();
// await runQueryClientTest();
// await runQueryServerTest();

/**
 * create the Elysia app
 */
const api = new Elysia({
  serve: {
    reusePort: true,
    idleTimeout: 0,
  },
});

/**
 * decorate the app with Borda
 * configure and start the server
 */
api
  // .use(borda.server())
  // .use(insta.server()) // default instant server
  .use(cors())
  // handle html response for custom routes
  .use(html())
  // add custom routes
  .get('/', () => 'Hello Elysia')
  .get('/password/reset', ({ set, query, html }) =>
    html(
      passwordResetGet({
        set,
        query,
      })
    )
  )
  .post('/password/reset', ({ set, body, html }) =>
    html(
      passwordResetPost({
        set,
        body,
      })
    )
  )
  // add custom sync endpoints
  .group('sync', (endpoint) =>
    endpoint
      .get(':collection', insta.collection.get(), {
        // already supports bearer token auth validation out of the box
        // uncomment the following to add custom validation
        // query: SyncBatchQueryCustomSchema,
        // params: SyncParamsSchema,
        // headers: SyncHeadersCustomSchema,
        // custom logic to validate request before it's handled
        // beforeHandle({ headers, params }) {
        //   // console.log('params', params);
        //   // console.log('headers', headers);
        // },
      })
      .post(':collection', insta.collection.post(), {
        // already supports bearer token auth validation out of the box
        // uncomment the following to add custom validation
        // query: SyncMutationQueryCustomSchema,
        // params: SyncParamsSchema,
        // headers: SyncHeadersCustomSchema,
        // custom logic to validate request before it's handled
        // beforeHandle({ headers, params, body, set }) {
        //   // console.log('params', params);
        //   // console.log('headers', headers);
        //   const collection = params.collection;
        //   const { type, message, summary, errors } = insta.validateBody(
        //     collection,
        //     body
        //   );
        //   if (errors) {
        //     set.status = 400;
        //     return {
        //       type,
        //       message,
        //       summary,
        //       errors,
        //     };
        //   }
        // },
      })
      .put(':collection/:id', insta.collection.put(), {
        // already supports bearer token auth validation out of the box
        // uncomment the following to add custom validation
        // query: SyncMutationQueryCustomSchema,
        // params: SyncMutationParamsSchema,
        // headers: SyncHeadersCustomSchema,
        // custom logic to validate request before it's handled
        // beforeHandle({ headers, params, body, set }) {
        //   // console.log('params', params);
        //   // console.log('headers', headers);
        //   const collection = params.collection;
        //   const { type, message, summary, errors } = insta.validateBody(
        //     collection,
        //     body
        //   );
        //   if (errors) {
        //     set.status = 400;
        //     return {
        //       type,
        //       message,
        //       summary,
        //       errors,
        //     };
        //   }
        // },
      })
      .delete(':collection/:id', insta.collection.delete(), {
        // already supports bearer token auth validation out of the box
        // uncomment the following to add custom validation
        // query: SyncMutationQueryCustomSchema,
        // params: SyncMutationParamsSchema,
        // headers: SyncHeadersCustomSchema,
        // custom logic to validate request before it's handled
        // beforeHandle({ headers, params, body }) {
        //   // console.log('params', params);
        //   // console.log('headers', headers);
        // },
      })
      .ws('live', {
        ...insta.live,
        // custom query schema
        query: SyncLiveQueryOrgSchema,
        // custom logic to validate request before it's handled
        beforeHandle(ws) {
          // console.log('url', ws.url);
          // throw new Error('custom error');
        },
      })
  )
  // add custom cloud endpoints
  .group('cloud', (endpoint) =>
    // already supports bearer token auth and public endpoints out of the box
    endpoint.post(':function', insta.cloud.post(), {
      // custom logic to validate request before it's handled
      beforeHandle({ headers, params }) {
        // @todo validate headers
        // console.log('params', params);
        // console.log('headers', headers);
      },
    })
  )

  // start the server
  .listen(1337);

console.log(`🏄 Running at http://${api.server?.hostname}:${api.server?.port}`);

const stats = await insta.db.stats();
console.log(`💽 Connected to database ${stats['db']}`);

delete stats['$clusterTime'];
delete stats['operationTime'];

console.table(stats);
console.timeEnd('startup');
console.time('latency');
