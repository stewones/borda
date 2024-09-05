/* eslint-disable @typescript-eslint/no-unused-vars */
import 'fake-indexeddb/auto';

import { z } from 'zod';

import {
  Instant,
  InstantSyncResponse,
  objectId,
  objectPointer,
  pointerRef,
} from '@borda/client';

import * as lib from '../../../client/src/lib';

// global mocks
global.structuredClone = jest.fn((data) => data);

const UserId = objectId('users');
const PostId = objectId('posts');
const CommentId = objectId('comments');

const UserPointer = objectPointer('users');
const PostPointer = objectPointer('posts');

jest.mock('../../../client/src/lib/fetcher');

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
      _p_user: UserPointer,
      title: z.string(),
      content: z.string(),
      author: UserPointer,
    }),
    comments: z.object({
      _id: CommentId,
      _created_at: z.string(),
      _updated_at: z.string(),
      _p_user: UserPointer,
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
      _p_user: pointerRef('users', 'objId0507'),
    },
    {
      _id: 'post11111',
      _created_at: '2020-07-28T03:08:41.768Z',
      _updated_at: '2020-07-28T03:08:41.768Z',
      title: 'Post 1',
      content: 'Hello world',
      author: pointerRef('users', 'objId2807'),
      _p_user: pointerRef('users', 'objId2807'),
    },
  ];

  let insta: Instant<typeof schema>;
  let fetcherSpy: jest.SpyInstance;

  beforeEach(async () => {
    insta = new Instant({
      schema,
      name: 'InstantTest',
      inspect: true,
      serverURL: 'https://some.api.com',
    });

    await insta.ready();

    // mock worker
    const worker = {
      onmessage: jest.fn(),
      postMessage: async (payload: string) =>
        await insta.worker()({ data: payload }),
    };

    insta.setWorker({ worker } as any);

    for (const user of users) {
      await insta.db.table('users').add(user);
    }
    for (const post of posts) {
      await insta.db.table('posts').add(post);
    }

    fetcherSpy = jest.spyOn(lib, 'fetcher').mockImplementation(
      // @ts-ignore
      (url, options) => {
        return Promise.resolve([]);
      }
    );
  });

  afterEach(async () => {
    await insta.db.delete();
    fetcherSpy.mockRestore();
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
      users: [
        {
          _id: 'objId0507',
          _created_at: '2022-07-05T03:08:41.768Z',
          _updated_at: '2022-07-05T03:08:41.768Z',
          name: 'Elis',
        },
        {
          _id: 'objId1111',
          _created_at: '2024-08-24T03:49:47.352Z',
          _updated_at: '2024-08-24T03:49:47.352Z',
          name: 'Tobias Afonso',
        },
        {
          _id: 'objId2222',
          _created_at: '2024-08-25T03:49:47.352Z',
          _updated_at: '2024-08-25T03:49:47.352Z',
          name: 'Teobaldo José',
        },
        {
          _id: 'objId2807',
          _created_at: '2020-07-28T03:08:41.768Z',
          _updated_at: '2020-07-28T03:08:41.768Z',
          name: 'Raul',
        },
      ],
    });
  });

  test('iQL query with two sided tables', async () => {
    const iql = {
      users: {},
      posts: {},
    };

    const result = await insta.query(iql);

    expect(result).toEqual({
      users: [
        {
          _id: 'objId0507',
          _created_at: '2022-07-05T03:08:41.768Z',
          _updated_at: '2022-07-05T03:08:41.768Z',
          name: 'Elis',
        },
        {
          _id: 'objId1111',
          _created_at: '2024-08-24T03:49:47.352Z',
          _updated_at: '2024-08-24T03:49:47.352Z',
          name: 'Tobias Afonso',
        },
        {
          _id: 'objId2222',
          _created_at: '2024-08-25T03:49:47.352Z',
          _updated_at: '2024-08-25T03:49:47.352Z',
          name: 'Teobaldo José',
        },
        {
          _id: 'objId2807',
          _created_at: '2020-07-28T03:08:41.768Z',
          _updated_at: '2020-07-28T03:08:41.768Z',
          name: 'Raul',
        },
      ],
      posts: [
        {
          _id: 'post11111',
          _created_at: '2020-07-28T03:08:41.768Z',
          _updated_at: '2020-07-28T03:08:41.768Z',
          title: 'Post 1',
          content: 'Hello world',
          author: 'users$objId2807',
          _p_user: 'users$objId2807',
        },
        {
          _id: 'post11112',
          _created_at: '2022-07-05T03:08:41.768Z',
          _updated_at: '2022-07-05T03:08:41.768Z',
          title: 'Post 2',
          content: 'Ei gentiii chegueii',
          author: 'users$objId0507',
          _p_user: 'users$objId0507',
        },
      ],
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
      users: [
        {
          _id: 'objId0507',
          _created_at: '2022-07-05T03:08:41.768Z',
          _updated_at: '2022-07-05T03:08:41.768Z',
          name: 'Elis',
          posts: [
            {
              _id: 'post11112',
              _created_at: '2022-07-05T03:08:41.768Z',
              _updated_at: '2022-07-05T03:08:41.768Z',
              title: 'Post 2',
              content: 'Ei gentiii chegueii',
              author: 'users$objId0507',
              _p_user: 'users$objId0507',
            },
          ],
        },
        {
          _id: 'objId1111',
          _created_at: '2024-08-24T03:49:47.352Z',
          _updated_at: '2024-08-24T03:49:47.352Z',
          name: 'Tobias Afonso',
          posts: [],
        },
        {
          _id: 'objId2222',
          _created_at: '2024-08-25T03:49:47.352Z',
          _updated_at: '2024-08-25T03:49:47.352Z',
          name: 'Teobaldo José',
          posts: [],
        },
        {
          _id: 'objId2807',
          _created_at: '2020-07-28T03:08:41.768Z',
          _updated_at: '2020-07-28T03:08:41.768Z',
          name: 'Raul',
          posts: [
            {
              _id: 'post11111',
              _created_at: '2020-07-28T03:08:41.768Z',
              _updated_at: '2020-07-28T03:08:41.768Z',
              title: 'Post 1',
              content: 'Hello world',
              author: 'users$objId2807',
              _p_user: 'users$objId2807',
            },
          ],
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
        _p_user: pointerRef('users', 'objId0507'),
      },
      {
        _id: 'post11111',
        _created_at: '2020-07-28T03:08:41.768Z',
        _updated_at: '2020-07-28T03:08:41.768Z',
        title: 'Post 1',
        content: 'Hello world',
        user: pointerRef('users', 'objId2807'),
        _p_user: pointerRef('users', 'objId2807'),
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
      users: [
        {
          _id: 'objId0507',
          _created_at: '2022-07-05T03:08:41.768Z',
          _updated_at: '2022-07-05T03:08:41.768Z',
          name: 'Elis',
          posts: [
            {
              _id: 'post11112',
              _created_at: '2022-07-05T03:08:41.768Z',
              _updated_at: '2022-07-05T03:08:41.768Z',
              title: 'Post 2',
              content: 'Ei gentiii chegueii',
              user: 'users$objId0507',
              _p_user: 'users$objId0507',
            },
          ],
        },
        {
          _id: 'objId1111',
          _created_at: '2024-08-24T03:49:47.352Z',
          _updated_at: '2024-08-24T03:49:47.352Z',
          name: 'Tobias Afonso',
          posts: [],
        },
        {
          _id: 'objId2222',
          _created_at: '2024-08-25T03:49:47.352Z',
          _updated_at: '2024-08-25T03:49:47.352Z',
          name: 'Teobaldo José',
          posts: [],
        },
        {
          _id: 'objId2807',
          _created_at: '2020-07-28T03:08:41.768Z',
          _updated_at: '2020-07-28T03:08:41.768Z',
          name: 'Raul',
          posts: [
            {
              _id: 'post11111',
              _created_at: '2020-07-28T03:08:41.768Z',
              _updated_at: '2020-07-28T03:08:41.768Z',
              title: 'Post 1',
              content: 'Hello world',
              user: 'users$objId2807',
              _p_user: 'users$objId2807',
            },
          ],
        },
      ],
    });
  });

  test('create records via batch sync', async () => {
    const fetcherSpy = jest.spyOn(lib, 'fetcher').mockImplementation(
      // @ts-ignore
      (url, options) => {
        return Promise.resolve({
          activity: 'recent',
          collection: 'users',
          count: 1,
          synced: new Date().toISOString(),
          data: [
            {
              status: 'created',
              value: {
                _id: 'objId1337',
                _created_at: '2024-08-25T03:49:47.352Z',
                _updated_at: '2024-08-25T03:49:47.352Z',
                name: 'John Doez',
              },
            },
          ],
        } as InstantSyncResponse);
      }
    );

    await insta.sync({
      session: '1337',
    });

    // check if data was updated
    const updatedUser = await insta.db.table('users').get('objId1337');

    expect(updatedUser.name).toBe('John Doez');

    // Clean up
    fetcherSpy.mockRestore();
  });

  test('update records via batch sync', async () => {
    const fetcherSpy = jest.spyOn(lib, 'fetcher').mockImplementation(
      // @ts-ignore
      (url, options) => {
        return Promise.resolve({
          activity: 'recent',
          collection: 'users',
          count: 1,
          synced: new Date().toISOString(),
          data: [
            {
              status: 'updated',
              value: {
                _id: 'objId2222',
                _created_at: '2024-08-25T03:49:47.352Z',
                _updated_at: '2024-08-25T03:49:47.352Z',
                name: 'Teobs',
              },
            },
          ],
        } as InstantSyncResponse);
      }
    );

    await insta.sync({
      session: '1337',
    });

    // check if data was updated
    const updatedUser = await insta.db.table('users').get('objId2222');
    expect(updatedUser.name).toBe('Teobs');

    // Clean up
    fetcherSpy.mockRestore();
  });

  test('delete records via batch sync', async () => {
    const fetcherSpy = jest.spyOn(lib, 'fetcher').mockImplementation(
      // @ts-ignore
      (url, options) => {
        return Promise.resolve({
          activity: 'recent',
          collection: 'users',
          count: 1,
          synced: new Date().toISOString(),
          data: [
            {
              status: 'deleted',
              value: {
                _id: 'objId1337',
                _created_at: '2024-08-25T03:49:47.352Z',
                _updated_at: '2024-08-25T03:49:47.352Z',
                name: 'Someone',
              },
            },
          ],
        } as InstantSyncResponse);
      }
    );

    await insta.sync({
      session: '1337',
    });

    // check if data was updated
    const updatedUser = await insta.db.table('users').get('objId1337');
    expect(updatedUser).toBeUndefined();

    // Clean up
    fetcherSpy.mockRestore();
  });

  test('should filter users using $regex', async () => {
    const { users } = await insta.query({
      users: {
        $filter: {
          name: { $regex: 't', $options: 'i' },
        },
      },
    });

    expect(users).toHaveLength(2);
    expect(users[0].name).toBe('Tobias Afonso');
    expect(users[1].name).toBe('Teobaldo José');
  });

  test('should filter users using $or', async () => {
    const { users } = await insta.query({
      users: {
        $or: [
          { name: { $regex: 't', $options: 'i' } },
          { name: { $eq: 'Elis' } },
        ],
      },
    });

    expect(users).toHaveLength(3);
    expect(users[0].name).toBe('Elis');
    expect(users[1].name).toBe('Tobias Afonso');
    expect(users[2].name).toBe('Teobaldo José');
  });

  test('should filter users using $eq', async () => {
    const { users } = await insta.query({
      users: {
        $filter: {
          name: { $eq: 'Raul' },
        },
      },
    });

    expect(users).toHaveLength(1);
    expect(users[0].name).toBe('Raul');
  });
});
