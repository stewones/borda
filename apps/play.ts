import { delay, pointer } from '@borda/client';
import { Borda, newObjectId } from '@borda/server';

import { faker } from '@faker-js/faker';

const borda = new Borda({
  inspect: false,
  mongoURI: 'mongodb://127.0.0.1:27017/borda-dev',
});
await borda.server();

////////////////////////////////////////

addManyUsersPostsComments();

////////////////////////////////////////

/**
 * 1. add many users
 * 2. for each user, add 10 posts
 * 3. for each post, add 10 comments
 *
 * users posts and comments should be related
 */
async function addManyUsersPostsComments() {
  console.log('adding many users > posts > comments');
  console.time('added many users > posts > comments');

  const users = [];
  for (let i = 0; i < 1000; i++) {
    const _id = newObjectId();
    const _date = new Date();

    await delay(1);

    users.push({
      _id,
      name: faker.person.fullName(),
      email: faker.internet.email(),
      _created_at: _date.toISOString(),
      _updated_at: _date.toISOString(),
    });
  }

  await borda.query('users').insertMany(users, {
    parse: {
      doc: false,
    },
  });

  // return console.log('users added');

  const posts = [];
  const postsUser = {};
  for (const user of users) {
    for (let i = 0; i < 50; i++) {
      const postId = newObjectId();
      const _date = new Date();

      await delay(1);

      posts.push({
        _id: postId,
        title: faker.lorem.sentence(),
        content: faker.lorem.paragraph(),
        _p_user: pointer('users', user._id),
        _created_at: _date.toISOString(),
        _updated_at: _date.toISOString(),
      });

      postsUser[postId] = user._id;
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
      const _date = new Date();

      await delay(1);

      comments.push({
        _id: newObjectId(),
        content: faker.lorem.paragraph(),
        _p_post: pointer('posts', post._id),
        _p_user: pointer('users', postsUser[post._id]),
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

  console.timeEnd('added many users > posts > comments');
}
