/* eslint-disable @typescript-eslint/no-unused-vars */
import 'fake-indexeddb/auto';

import { z } from 'zod';

import * as lib from '../../../client/src/lib';
import {
  Instant,
  InstantSyncResponse,
  objectId,
  objectPointer,
  pointerRef,
} from '../../../client/src/lib/Instant';

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
  let fetcherSpy: jest.SpyInstance;

  beforeEach(async () => {
    insta = new Instant({
      schema,
      name: 'InstantTest',
      inspect: true,
      serverURL: 'https://some.api.com',
    });
    await insta.ready();

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

  test('create records via sync SSE', async () => {
    // Mock console.log
    const consoleSpy = jest.spyOn(console, 'log');

    // Mock EventSource
    const mockEventSource = {
      addEventListener: jest.fn(),
      close: jest.fn(),
      onopen: jest.fn(),
      onerror: jest.fn(),
      onmessage: jest.fn(),
    };

    global.EventSource = jest.fn(() => mockEventSource) as any;

    await insta.sync();

    // dispatch mock message
    const mockMessage = {
      data: JSON.stringify({
        collection: 'users',
        objectId: 'objId1337',
        status: 'created',
        value: {
          _id: 'objId1337',
          _created_at: '2024-08-25T03:49:47.352Z',
          _updated_at: '2024-08-25T03:49:47.352Z',
          name: 'John Doe',
        },
      } as InstantSyncResponse),
    };

    mockEventSource.onmessage(mockMessage);

    // Check if console.log was called with the expected message
    expect(consoleSpy).toHaveBeenCalledWith('SSE message', {
      collection: 'users',
      objectId: 'objId1337',
      status: 'created',
      value: {
        _id: 'objId1337',
        _created_at: '2024-08-25T03:49:47.352Z',
        _updated_at: '2024-08-25T03:49:47.352Z',
        name: 'John Doe',
      },
    });

    // check if data was updated
    const updatedUser = await insta.db.table('users').get('objId1337');
    expect(updatedUser.name).toBe('John Doe');

    // Clean up
    consoleSpy.mockRestore();
    mockEventSource.close();
  });

  test('update records via sync SSE', async () => {
    // Mock console.log
    const consoleSpy = jest.spyOn(console, 'log');

    // Mock EventSource
    const mockEventSource = {
      addEventListener: jest.fn(),
      close: jest.fn(),
      onopen: jest.fn(),
      onerror: jest.fn(),
      onmessage: jest.fn(),
    };

    global.EventSource = jest.fn(() => mockEventSource) as any;

    await insta.sync();

    // dispatch mock message
    const mockMessage = {
      data: JSON.stringify({
        collection: 'users',
        objectId: 'objId2222',
        value: {
          name: 'Teobs',
        },
        status: 'updated',
      } as InstantSyncResponse),
    };

    mockEventSource.onmessage(mockMessage);

    // Check if console.log was called with the expected message
    expect(consoleSpy).toHaveBeenCalledWith('SSE message', {
      collection: 'users',
      objectId: 'objId2222',
      value: { name: 'Teobs' },
      status: 'updated',
    });

    // check if data was updated
    const updatedUser = await insta.db.table('users').get('objId2222');
    expect(updatedUser.name).toBe('Teobs');

    // Clean up
    consoleSpy.mockRestore();
    mockEventSource.close();
  });

  test('delete records via sync SSE', async () => {
    // Mock console.log
    const consoleSpy = jest.spyOn(console, 'log');

    // Mock EventSource
    const mockEventSource = {
      addEventListener: jest.fn(),
      close: jest.fn(),
      onopen: jest.fn(),
      onerror: jest.fn(),
      onmessage: jest.fn(),
    };

    global.EventSource = jest.fn(() => mockEventSource) as any;

    await insta.sync();

    // dispatch mock message
    const mockMessage = {
      data: JSON.stringify({
        collection: 'users',
        objectId: 'objId1337',
        status: 'deleted',
        value: {},
      } as InstantSyncResponse),
    };

    mockEventSource.onmessage(mockMessage);

    // Check if console.log was called with the expected message
    expect(consoleSpy).toHaveBeenCalledWith('SSE message', {
      collection: 'users',
      objectId: 'objId1337',
      status: 'deleted',
      value: {},
    });

    // check if data was updated
    const updatedUser = await insta.db.table('users').get('objId1337');
    expect(updatedUser).toBeUndefined();

    // Clean up
    consoleSpy.mockRestore();
    mockEventSource.close();
  });

  test('create records via sync batch', async () => {
    fetcherSpy = jest.spyOn(lib, 'fetcher').mockImplementation(
      // @ts-ignore
      (url, options) => {
        if (url === 'https://some.api.com/instant/sync/batch') {
          return Promise.resolve([
            {
              collection: 'users',
              objectId: 'objId1337',
              status: 'created',
              value: {
                _id: 'objId1337',
                _created_at: '2024-08-25T03:49:47.352Z',
                _updated_at: '2024-08-25T03:49:47.352Z',
                name: 'John McDoe',
              },
            },
          ]);
        }
        return Promise.resolve([]);
      }
    );

    await insta.sync();

    expect(fetcherSpy).toHaveBeenCalledWith(
      'https://some.api.com/instant/sync/batch',
      expect.objectContaining({
        method: 'POST',
        direct: true,
        body: {
          collections: ['users', 'posts', 'comments'],
          lastSyncAt: null,
        },
      })
    );

    // check if data was updated
    const updatedUser = await insta.db.table('users').get('objId1337');
    expect(updatedUser.name).toBe('John McDoe');
  });
});
