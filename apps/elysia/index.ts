import { Elysia } from 'elysia';

import { pointer } from '@borda/sdk';
import { Borda, memoryUsage } from '@borda/server';
import { html } from '@elysiajs/html';

import { passwordResetGet, passwordResetPost } from './routes/password';
import {
  afterDeletePublicUser,
  afterSaveUser,
  beforeSaveUser,
  beforeSignUp,
} from './triggers';

export const borda = new Borda({
  name: 'borda-on-elysia',
  inspect: false,
  cacheTTL: 1000 * 1 * 20, // lower this number to see the auto cache removal in action
  plugins: [
    {
      name: 'MyCustomEmailProvider',
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
      name: 'MyCustomEmailPasswordResetTemplate',
      version: '0.0.0',
      EmailPasswordResetTemplate({ token, user, baseUrl }) {
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
 * attach database triggers
 */
borda.cloud.beforeSignUp(beforeSignUp);
borda.cloud.beforeSave('User', beforeSaveUser);
borda.cloud.afterSave('User',afterSaveUser)
borda.cloud.afterDelete('PublicUser',afterDeletePublicUser)

/** 
 * attach server functions
 */
// 

/**
 * subscribe to the ready event
 */
borda.onReady.subscribe(async ({ db, name }) => {
  const stats = await db.stats();
  console.log(`Borda is connected to the database ${stats['db']} from ${name}`);

  delete stats['$clusterTime'];
  delete stats['operationTime'];

  console.table(stats);
  console.timeEnd('startup');
  console.time('ping');
  await borda
    .ping()
    .then(() => {
      console.timeEnd('ping');
      console.log('🧠 memory', memoryUsage());
    })
    .catch((err) => console.log(err));

  await runQueryTests();
});

/**
 * start the client server
 * with borda as a plugin
 */
const app = new Elysia()
  .use(await borda.server())
  .use(html())
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
  .listen(1337);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);



async function runQueryTests() {
  // insert
  await borda
    .query('User')
    .insert({
      name: 'John',
      age: 30,
    })
    .then((user) => console.log('new user', user))
    .catch((err) => console.log(err));

  // find
  await borda
    .query('User')
    .find()
    .then((users) => console.log('users', users))
    .catch((err) => console.log(err));

  // findOne
  await borda
    .query('User')
    .filter({
      age: {
        $gte: 29,
      },
    })
    .findOne()
    .then((user) => console.log('a user', user))
    .catch((err) => console.log(err));

  // removeMany
  await borda
    .query('User')
    .filter({
      age: {
        $gte: 18,
      },
    })
    .deleteMany()
    .then((response) => console.log('users deleted', response))
    .catch((err) => console.log(err));

  // insertMany
  await borda
    .query('User')
    .insertMany([
      {
        name: 'John',
        age: 30,
      },
      {
        name: 'Jane',
        age: 25,
      },
    ])
    .then((users) => console.log('many inserted users', users))
    .catch((err) => console.log(err));

  // aggregate
  await borda
    .query('User')
    .pipeline([
      {
        $match: {
          age: {
            $gte: 29,
          },
        },
      },
      {
        $group: {
          _id: '$name',
          total_age: {
            $sum: '$age',
          },
        },
      },
      {
        $sort: {
          total: -1,
        },
      },
      {
        $addFields: {
          name: '$_id',
        },
      },
      {
        $project: {
          _id: 0,
          name: 1,
          total_age: 1,
        },
      },
    ])
    .aggregate()
    .then((agg) => console.log('aggregated users', agg))
    .catch((err) => console.log(err));

  // count
  await borda
    .query('User')
    .filter({
      age: {
        $gte: 29,
      },
    })
    .count()
    .then((count) => console.log('count', count))
    .catch((err) => console.log(err));

  // insert + remove
  await borda
    .query('User')
    .insert({
      name: 'Jane',
      age: 25,
    })
    .then((user) => console.log('jane user inserted', user))
    .catch((err) => console.log(err));

  await borda
    .query('User')
    .filter({
      name: 'Jane',
    })
    .delete()
    .then(() => console.log('jane user removed'))
    .catch((err) => console.log(err));

  // insert john
  await borda
    .query('User')
    .insert({
      name: 'John',
      age: 30,
    })
    .then((user) => console.log('john user inserted', user))
    .catch((err) => console.log(err));

  // update
  await borda
    .query('User')
    .filter({
      name: 'John',
    })
    .update({
      $inc: {
        age: 1,
      },
      $set: {
        _updated_at: new Date(),
      },
    })
    .then((response) => console.log('users updated', response))
    .catch((err) => console.log(err));

  // find again
  await borda
    .query('User')
    .find()
    .then((users) => console.log('users', users))
    .catch((err) => console.log(err));

  // update many
  await borda
    .query('User')
    .filter({
      name: {
        $exists: true,
      },
    })
    .updateMany({
      $inc: {
        age: 1,
      },
      $set: {
        _updated_at: new Date(),
      },
    })
    .then((response) => console.log('users updated', response))
    .catch((err) => console.log(err));

  // upsert
  await borda
    .query('User')
    .filter({
      name: 'Joe',
    })
    .upsert({
      name: 'Joe',
      age: 18,
    })
    .then((response) =>
      console.log('user upserted', JSON.stringify(response, null, 2))
    )
    .catch((err) => console.log(err));

  // upsertMany
  await borda
    .query('User')
    .filter({
      name: '$$name',
    })
    .upsertMany([
      {
        name: 'Joe',
        age: 20,
      },
      {
        name: 'Jane',
        age: 27,
      },
      {
        name: 'Kat',
        age: 19,
      },
    ])
    .then((response) =>
      console.log('users upserted', JSON.stringify(response, null, 2))
    )
    .catch((err) => console.log(err));

  // insert + include
  const userToInclude: any = await borda
    .query('User')
    .insert({
      name: 'Elon',
      age: 42,
    })
    .catch((err) => console.log(err));

  // insert a pointer
  await borda
    .query('Post')
    .insert({
      title: 'My first post',
      user: pointer('User', userToInclude.objectId),
    })
    .then((post) => console.log('post inserted', post))
    .catch((err) => console.log(err));

  // query posts
  await borda
    .query('Post')
    .include(['user'])
    .find()
    .then((posts) => console.log('posts', posts))
    .catch((err) => console.log(err));

  // clean up posts
  // await borda
  //   .query('Post')
  //   .filter({
  //     title: {
  //       $exists: true,
  //     },
  //   })
  //   .deleteMany()
  //   .then((response) => console.log('posts deleted', response))
  //   .catch((err) => console.log(err));

  // update by id (put)
  await borda
    .query('User')
    .update(userToInclude.objectId, {
      name: 'John',
      age: 33,
    })
    .then((user) => console.log('updated user', user))
    .catch((err) => console.log(err));

  // get by id (get)
  await borda
    .query('User')
    .findOne(userToInclude.objectId)
    .then((user) => console.log('user', user))
    .catch((err) => console.log(err));

  // update
  await borda
    .query('User')
    .update(userToInclude.objectId, {
      name: 'Elon Musk',
    })
    .then((user) => console.log('updated user', user))
    .catch((err) => console.log(err));
}

