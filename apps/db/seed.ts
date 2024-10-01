import { delay, pointer } from '@borda/client';
import { Instant, newObjectId } from '@borda/server';

import { SyncSchema } from '@/common';
import { faker } from '@faker-js/faker';

const insta = new Instant({
  schema: SyncSchema,
});

await insta.ready();

////////////////////////////////////////
(async () => {
  // only runs the seed if the users collection is empty
  const users = await insta.db.collection('users').find({}).toArray();
  if (users.length === 0) {
    //addOneUser();
    await addManyOrgsUsersPostsComments();
  }
  // process.exit(0);
})();

////////////////////////////////////////

async function addOneUser() {
  const _id = newObjectId() as any;
  const _date = new Date();

  await delay(1);

  await insta.db.collection('users').insertOne(
    {
      _id,
      name: faker.person.fullName(),
      email: faker.internet.email().toLowerCase(),
      _created_at: _date,
      _updated_at: _date,
    },
    {
      forceServerObjectId: false,
    }
  );
}

/**
 * 1. add some orgs
 * 2. add some users for each org
 * 3. for each user, add some posts scopped to the user + org
 * 4. for each post, add some comments scopped to the post + user + org
 *
 * orgs, users, posts and comments should be related
 *
 * @todo make sure emails are unique and lowercase
 */
async function addManyOrgsUsersPostsComments() {
  const key = '🗃️  seeding database...';
  console.time(key);
  console.log(key);
  console.log('👀 this may take a while...');

  const orgs = [];
  for (let i = 0; i < 10; i++) {
    const _id = newObjectId();
    const _date = new Date();

    await delay(1);

    orgs.push({
      _id,
      name: faker.company.name(),
      _created_at: _date,
      _updated_at: _date,
    });
  }

  await insta.db.collection('orgs').insertMany(orgs as any, {
    forceServerObjectId: false,
  });

  const users = [];
  for (const org of orgs) {
    for (let i = 0; i < 250; i++) {
      const _id = newObjectId();
      const _date = new Date();

      await delay(1);

      users.push({
        _id,
        name: faker.person.fullName(),
        email: faker.internet.email().toLowerCase(),
        _p_org: pointer('orgs', org._id),
        _created_at: _date,
        _updated_at: _date,
      });
    }
  }

  await insta.db.collection('users').insertMany(users as any, {
    forceServerObjectId: false,
  });

  const posts = [];
  for (const user of users) {
    for (let i = 0; i < 5; i++) {
      const _id = newObjectId();
      const _date = new Date();

      await delay(1);

      posts.push({
        _id,
        title: faker.lorem.sentence(),
        content: faker.lorem.paragraph(),
        _p_user: pointer('users', user._id),
        _p_org: user._p_org,
        _created_at: _date,
        _updated_at: _date,
      });
    }
  }

  await insta.db.collection('posts').insertMany(posts as any, {
    forceServerObjectId: false,
  });

  const comments = [];
  for (const post of posts) {
    for (let i = 0; i < 3; i++) {
      const _id = newObjectId();
      const _date = new Date();

      await delay(1);

      comments.push({
        _id,
        content: faker.lorem.paragraph(),
        _p_post: pointer('posts', post._id),
        _p_user: post._p_user,
        _p_org: post._p_org,
        _created_at: _date,
        _updated_at: _date,
      });
    }
  }

  await insta.db.collection('comments').insertMany(comments as any, {
    forceServerObjectId: false,
  });

  console.timeEnd(key);

  process.exit(0);
}
