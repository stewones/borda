import { Elysia } from 'elysia';

import { Instant } from '@borda/server';

import {
  CloudSchema,
  SyncSchema,
} from '@/common';
import { cors } from '@elysiajs/cors';
import { html } from '@elysiajs/html';
import { jwt } from '@elysiajs/jwt';

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
  inspect: true,
  schema: SyncSchema,
  cloud: CloudSchema,
  index: {
    users: {
      // compound indexes example
      mostRecentByNameAsc: {
        definition: {
          _updated_at: -1,
          name: 1,
        },
      },
    },
  },
  // set constraints to restrict broadcast and filtered data
  // constraints: [
  //   {
  //     key: 'org',
  //     collection: 'orgs',
  //   },
  // ],
});

await insta.ready();

/**
 * attach server functions with full type safety
 */
insta.cloud.addFunction('login', async ({ body, headers, set }) => {
  console.log('login body', body); // expected to be { email: string; password: string }
  console.log('login headers', headers); // expected to be unknown

  const session = await insta.auth.signIn({
    email: body.email,
    password: body.password,
  });

  // expects a session to be returned
  // containing a token and user info
  return session;
});

insta.cloud.addFunction('logout', async ({ headers, set }) => {
  console.log('logout headers', headers); // expects authorization header
  const bearer = headers.authorization.split(' ')[1].replace('Bearer ', '');
  await insta.auth.signOut({ token: bearer });
  // doesn't expect return
});

insta.cloud.addFunction('sign-up', async ({ body, headers }) => {
  console.log('sign-up body', body); // expected to be { name: string; email: string; password: string }
  console.log('sign-up headers', headers); // expected to be unknown

  const session = await insta.auth.signUp({
    name: body.name,
    email: body.email,
    password: body.password,
  });

  // expects a session to be returned
  // containing a token and user info
  return session;
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

// @todo add to the built-in version
insta.db.addHook('afterDelete', 'sessions', async ({ doc }) => {
  // remove cached token
  insta.cache.del(`session:${doc.token}`);
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
  // use jwt plugin
  .use(
    jwt({
      name: 'jwt',
      secret: process.env['INSTA_SECRET'] || '1nSt@nT3',
    })
  )
  // eject live endpoint
  .ws('live', {
    ...insta.live(),
    // custom beforeHandle and other ElysiaWS methods
    // please note that this will override the default live sync logic
    // so you need to replicate anything needed here
    // beforeHandle(ws) {
    //   console.log('live beforeHandle', ws);
    //   // console.log('url', ws.url);
    //   // throw new Error('custom error');
    // },
  })
  // eject sync endpoints
  .group('sync', (endpoint) =>
    endpoint
      .derive(insta.collection.derive())
      .get(':collection', insta.collection.get(), {
        beforeHandle: insta.collection.beforeHandle(),
        afterHandle({ session, collection, response }) {
          // add your custom logic here for after handling requests
          // if there's no user session, that means the request was unauthorized
          // but you still can access information and elysia features
          if (session.user) {
            // console.log(
            //   `sync get ${collection} request by ${session.user.name}`,
            //   response
            // );
          }
        },
      })
      .post(':collection', insta.collection.post(), {
        beforeHandle: insta.collection.beforeHandle(),
        afterHandle({ session, collection, response }) {
          if (session.user) {
            console.log(
              `sync post ${collection} request by ${session.user.name}`,
              response
            );
          }
        },
      })
      .put(':collection/:id', insta.collection.put(), {
        beforeHandle: insta.collection.beforeHandle(),
        afterHandle({ session, collection, response }) {
          if (session.user) {
            console.log(
              `sync put ${collection} request by ${session.user.name}`,
              response
            );
          }
        },
      })
      .delete(':collection/:id', insta.collection.delete(), {
        beforeHandle: insta.collection.beforeHandle(),
        afterHandle({ session, collection, response }) {
          if (session.user) {
            console.log(
              `sync delete ${collection} request by ${session.user.name}`,
              response
            );
          }
        },
      })
  )
  // eject cloud endpoint
  .group('cloud', (endpoint) =>
    endpoint.derive(insta.cloud.derive()).post(':fn', insta.cloud.post(), {
      beforeHandle: insta.cloud.beforeHandle(),
      afterHandle({ session, fn, response }) {
        // add your custom logic here for after handling requests
        // if there's no user session, that means the request was unauthorized
        // but you still can access information and elysia features

        const user = session.user || response['user'];
        // response['user'] here is the return value of a cloud function.
        // for example the login one above which returns a session + user info.
        // it's totally up to you what to return.
        if (user) {
          console.log(
            `cloud function ${fn} executed by ${user.name}`,
            response
          );
        }
      },
    })
  )
  // @todo add custom routes for password reset flow
  .get('/', () => 'Hello from Elysia')
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
