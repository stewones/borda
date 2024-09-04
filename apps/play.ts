import { delay, pointer } from '@borda/client';
import { Borda, newObjectId } from '@borda/server';

import { faker } from '@faker-js/faker';

const borda = new Borda({
  inspect: false,
  mongoURI: 'mongodb://127.0.0.1:27017/borda-dev',
});

await borda.ready();

borda.server();

////////////////////////////////////////

//addManyOrgsUsersPostsComments();

addOneUser();

////////////////////////////////////////

async function addOneUser() {
  const _id = newObjectId();
  const _date = new Date();

  await delay(1);

  const org = await borda.query('orgs').findOne('YwkJYEdhgh');

  if (!org['objectId']) {
    throw new Error('org not found');
  }

  await borda.query('users').insert({
    _id,
    name: faker.person.fullName(),
    email: faker.internet.email(),
    _p_org: pointer('orgs', org['objectId']),
    _created_at: _date.toISOString(),
    _updated_at: _date.toISOString(),
  });
}

/**
 * 1. add some orgs
 * 2. add some users for each org
 * 3. for each user, add some posts scopped to the user + org
 * 4. for each post, add some comments scopped to the post + user + org
 *
 * orgs, users, posts and comments should be related
 */
async function addManyOrgsUsersPostsComments() {
  const key = 'added orgs > users > posts > comments';
  console.log(key.replace('added', 'adding'), 'this may take a while...');
  console.time(key);

  const orgs = [];
  for (let i = 0; i < 10; i++) {
    const _id = newObjectId();
    const _date = new Date();

    await delay(1);

    orgs.push({
      _id,
      name: faker.company.name(),
      _created_at: _date.toISOString(),
      _updated_at: _date.toISOString(),
    });
  }

  await borda.query('orgs').insertMany(orgs, {
    parse: {
      doc: false,
    },
  });

  const users = [];
  for (const org of orgs) {
    for (let i = 0; i < 500; i++) {
      const _id = newObjectId();
      const _date = new Date();

      await delay(1);

      users.push({
        _id,
        name: faker.person.fullName(),
        email: faker.internet.email(),
        _p_org: pointer('orgs', org._id),
        _created_at: _date.toISOString(),
        _updated_at: _date.toISOString(),
      });
    }
  }

  await borda.query('users').insertMany(users, {
    parse: {
      doc: false,
    },
  });

  const posts = [];
  for (const user of users) {
    for (let i = 0; i < 10; i++) {
      const _id = newObjectId();
      const _date = new Date();

      await delay(1);

      posts.push({
        _id,
        title: faker.lorem.sentence(),
        content: faker.lorem.paragraph(),
        _p_user: pointer('users', user._id),
        _p_org: user._p_org,
        _created_at: _date.toISOString(),
        _updated_at: _date.toISOString(),
      });
    }
  }

  await borda.query('posts').insertMany(posts, {
    parse: {
      doc: false,
    },
  });

  const comments = [];
  for (const post of posts) {
    for (let i = 0; i < 4; i++) {
      const _id = newObjectId();
      const _date = new Date();

      await delay(1);

      comments.push({
        _id,
        content: faker.lorem.paragraph(),
        _p_post: pointer('posts', post._id),
        _p_user: post._p_user,
        _p_org: post._p_org,
        _created_at: _date.toISOString(),
        _updated_at: _date.toISOString(),
      });
    }
  }

  await borda.query('comments').insertMany(comments, {
    parse: {
      doc: false,
    },
  });
  console.timeEnd(key);
}
