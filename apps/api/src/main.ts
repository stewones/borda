import { Elysia, t } from 'elysia';

import { Instant } from '@borda/server';

import { CloudSchema, SyncSchema } from '@/common';
import { cors } from '@elysiajs/cors';
import { html } from '@elysiajs/html';

console.log('INSTA_MONGO_URI', process.env['INSTA_MONGO_URI']);

/**
 * instantiate and export the borda server
 * its instance is the client you should use
 */
// export const borda = new BordaServer({
//   name: 'borda-on-elysia',
//   inspect: false,
//   cacheTTL: 1000 * 1 * 60 * 60,
//   liveCollections: ['Counter', 'PublicUser'],
//   reservedCollections: ['_User', '_Password', '_Session'],
//   plugins: [
//     {
//       name: 'my-email-provider',
//       version: '0.0.0',
//       EmailProvider() {
//         return {
//           send(params: {
//             to: { name: string; email: string };
//             subject: string;
//             html: string;
//           }) {
//             console.log(`
//               -------------------
//               @todo implement your own email provider
//               -------------------
//               # to: ${params.to.name} <${params.to.email}>
//               # subject: ${params.subject}
//               # html: ${params.html}
//             `);
//             return Promise.resolve();
//           },
//         };
//       },
//     },
//     {
//       name: 'my-password-reset-template',
//       version: '0.0.0',
//       EmailPasswordResetTemplate({ token, user, baseUrl, request }) {
//         return {
//           subject: 'Custom Password Reset',
//           html: `
//               <p>Hello ${user.name},</p>
//               <p>Here is your password reset link:</p>
//               <p>${baseUrl}/password/reset?token=${token}</p>
//               <br />
//               <br />
//               <p>Best,</p>
//               <p>Your Co.</p>
//           `,
//         };
//       },
//     },
//   ],
// });

/**
 * Setup Instant with schemas and options
 */
const insta = new Instant({
  schema: SyncSchema,
  cloud: CloudSchema,
  // live: LiveSchema, // @todo migrate from Typebox
  size: parseInt(process.env['INSTA_BATCH_SIZE'] || '1_000'),
  // set constraints to restrict broadcast and filtered data
  // constraints: [
  //   {
  //     key: 'org',
  //     collection: 'orgs',
  //   },
  // ],
  inspect: true,
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
// @todo replace with Zod and a new schema prop "livequery" in the initialization
const SyncLiveQueryOrgSchema = t.Object({
  ...Instant.SyncLiveQuery,
  // org: t.String(), // can also be multiple orgs split by comma - the key must be a pointer mapped in the constraints
});

/**
 * attach server functions with full type safety
 */
insta.cloud.addFunction('login', async ({ body, headers, set }) => {
  console.log('body', body); // expected to be { email: string; password: string }
  console.log('headers', headers); // expected to be unknown
  try {
    const session = await insta.auth.signIn({
      email: body.email,
      password: body.password,
    });

    // expects a session to be returned
    // containing a token and user info
    return session;
  } catch (err: any) {
    console.log('login error', err);
    set.status = err.status;
    return Promise.reject(err);
  }
});

insta.cloud.addFunction('logout', async ({ headers, set }) => {
  console.log('headers', headers); // expected authorization header to be used
  try {
    await insta.auth.signOut({ token: headers.authorization.split(' ')[1] });
    // doesn't expect return
  } catch (err: any) {
    set.status = err.status;
    console.log('logout error', err);
  }
});

insta.cloud.addFunction('sign-up', async ({ body, headers }) => {
  console.log('body', body); // expected to be { name: string; email: string; password: string }
  console.log('headers', headers); // expected to be unknown
  try {
    const session = await insta.auth.signUp({
      name: body.name,
      email: body.email,
      password: body.password,
    });

    // expects a session to be returned
    // containing a token and user info
    return session;
  } catch (err: any) {
    console.log('create account error', err.status, err);
    return Promise.reject(err);
  }
});

/**
 * attach some cloud hooks
 */
insta.cloud.addHook('beforeSave', 'users', async ({ doc, before, session }) => {
  console.log('beforeSave before', before);
  console.log('next', doc);
  console.log('session', session);
  return doc;
});

insta.cloud.addHook('afterSave', 'users', async ({ doc, before, session }) => {
  console.log('afterSave', 'before', before);
  console.log('next', doc);
  console.log('session', session);
});

insta.cloud.addHook(
  'beforeDelete',
  'users',
  async ({ doc, before, session }) => {
    console.log('beforeDelete', 'before', before);
    console.log('next', doc);
    console.log('session', session);
  }
);

insta.cloud.addHook(
  'afterDelete',
  'users',
  async ({ doc, before, session }) => {
    console.log('afterDelete', 'before', before);
    console.log('next', doc);
    console.log('session', session);
  }
);

/**
 * attach some database hooks
 */
insta.db.addHook('afterInsert', 'users', async ({ doc }) => {
  console.log('db afterInsert doc', doc);
});
insta.db.addHook('afterUpdate', 'users', async ({ doc }) => {
  console.log('db afterUpdate doc', doc);
});
insta.db.addHook('afterDelete', 'users', async ({ doc }) => {
  console.log('db afterDelete doc', doc);
});

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
  // .use(insta.server()) // default instant server
  .use(cors())
  // handle html response for custom routes
  .use(html())
  // add custom routes
  .get('/', () => 'Hello from Elysia')
  // @todo add password reset flow
  // .get('/password/reset', ({ set, query, html }) =>
  //   html(
  //     passwordResetGet({
  //       set,
  //       query,
  //     })
  //   )
  // )
  // .post('/password/reset', ({ set, body, html }) =>
  //   html(
  //     passwordResetPost({
  //       set,
  //       body,
  //     })
  //   )
  // )
  // eject sync endpoints
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
        query: SyncLiveQueryOrgSchema, // @todo replace with Zod
        // custom logic to validate request before it's handled
        beforeHandle(ws) {
          // console.log('url', ws.url);
          // throw new Error('custom error');
        },
      })
  )
  // eject cloud endpoint
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
