/* eslint-disable @typescript-eslint/no-unused-vars */
import 'fake-indexeddb/auto';

// import { openDB } from 'idb';
import { z } from 'zod';

import {
  Instant,
  objectId,
  objectPointer,
  pointerRef,
} from './Instant';

// mock structuredClone
global.structuredClone = jest.fn((data) => data);

const UserId = objectId('users');
const PostId = objectId('posts');
const CommentId = objectId('comments');

const UserPointer = objectPointer('users');
const PostPointer = objectPointer('posts');

describe('Instant', () => {
  const schema = {
    users: z.object({
      _id: UserId,
      _created_at: z.string(),
      _updated_at: z.string(),
      name: z.string(),
    }),
    posts: z.object({
      _id: PostId,
      _created_at: z.string(),
      _updated_at: z.string(),
      title: z.string(),
      content: z.string(),
      author: UserPointer,
      user: UserPointer,
    }),
    comments: z.object({
      _id: CommentId,
      _created_at: z.string(),
      _updated_at: z.string(),
      author: UserPointer,
      posts: PostPointer,
      content: z.string(),
    }),
  };

  const users = [
    {
      _id: 'objId2222',
      _created_at: '2024-08-25T03:49:47.352Z',
      _updated_at: '2024-08-25T03:49:47.352Z',
      name: 'Teobaldo José',
    },
    {
      _id: 'objId1111',
      _created_at: '2024-08-24T03:49:47.352Z',
      _updated_at: '2024-08-24T03:49:47.352Z',
      name: 'Tobias Afonso',
    },
    {
      _id: 'objId0507',
      _created_at: '2022-07-05T03:08:41.768Z',
      _updated_at: '2022-07-05T03:08:41.768Z',
      name: 'Elis',
    },
    {
      _id: 'objId2807',
      _created_at: '2020-07-28T03:08:41.768Z',
      _updated_at: '2020-07-28T03:08:41.768Z',
      name: 'Raul',
    },
  ];

  const posts = [
    {
      _id: 'post11112',
      _created_at: '2022-07-05T03:08:41.768Z',
      _updated_at: '2022-07-05T03:08:41.768Z',
      title: 'Post 2',
      content: 'Ei gentiii chegueii',
      author: pointerRef('users', 'objId0507'),
    },
    {
      _id: 'post11111',
      _created_at: '2020-07-28T03:08:41.768Z',
      _updated_at: '2020-07-28T03:08:41.768Z',
      title: 'Post 1',
      content: 'Hello world',
      author: pointerRef('users', 'objId2807'),
    },
  ];

  let insta: Instant;

  beforeEach(async () => {
    insta = new Instant({ schema, name: 'InstantTest' });
    for (const user of users) {
      await insta.db.table('users').add(user);
    }
    for (const post of posts) {
      await insta.db.table('posts').add(post);
    }
  });

  afterEach(async () => {
    await insta.db.delete();
  });

  test('list all users', async () => {
    const result = await insta.db
      .table('users')
      .orderBy('_created_at')
      .reverse()
      .toArray()
      .catch(console.log);
    expect(result).toEqual(users);
  });

  test('filter users named Raul', async () => {
    const result = await insta.db
      .table('users')
      .filter((user) => user.name === 'Raul')
      .toArray()
      .catch(console.log);
    expect(result).toEqual([users.find((user) => user.name === 'Raul')]);
  });

  test('list users named tob using regex case insensitive', async () => {
    const result = await insta.db
      .table('users')
      .filter((user) => /tob/i.test(user.name))
      .toArray();

    expect(result).toEqual([users.find((user) => /tob/i.test(user.name))]);
  });

  test('list all posts', async () => {
    const result = await insta.db.table('posts').toArray();

    expect(result).toEqual([...posts].reverse());
  });

  test('simple iQL query', async () => {
    const iql = {
      users: {},
    };

    const result = await insta.query(iql);
    expect(result).toEqual({
      users: users,
    });
  });

  test('iQL query with two sided tables', async () => {
    const iql = {
      users: {},
      posts: {},
    };

    const result = await insta.query(iql);

    expect(result).toEqual({
      users: users,
      posts: posts,
    });
  });

  test('nested iQL query with $by directive', async () => {
    const result = await insta.query({
      users: {
        posts: {
          $by: 'author',
        },
      },
    });

    expect(result).toEqual({
      // all users and inside each user, all posts
      users: [
        {
          ...users[0],
          posts: [],
        },
        {
          ...users[1],
          posts: [],
        },
        {
          ...users[2],
          posts: [posts[0]],
        },
        {
          ...users[3],
          posts: [posts[1]],
        },
      ],
    });
  });

  test('nested iQL query without $by directive', async () => {
    const posts2 = [
      {
        _id: 'post11112',
        _created_at: '2022-07-05T03:08:41.768Z',
        _updated_at: '2022-07-05T03:08:41.768Z',
        title: 'Post 2',
        content: 'Ei gentiii chegueii',
        user: pointerRef('users', 'objId0507'),
      },
      {
        _id: 'post11111',
        _created_at: '2020-07-28T03:08:41.768Z',
        _updated_at: '2020-07-28T03:08:41.768Z',
        title: 'Post 1',
        content: 'Hello world',
        user: pointerRef('users', 'objId2807'),
      },
    ];

    await insta.db.table('posts').clear();

    for (const post of posts2) {
      await insta.db.table('posts').add(post);
    }

    const result = await insta.query({
      users: {
        posts: {},
      },
    });

    expect(result).toEqual({
      // all users and inside each user, all posts
      users: [
        {
          ...users[0],
          posts: [],
        },
        {
          ...users[1],
          posts: [],
        },
        {
          ...users[2],
          posts: [posts2[0]],
        },
        {
          ...users[3],
          posts: [posts2[1]],
        },
      ],
    });
  });
});
