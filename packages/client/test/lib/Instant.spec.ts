/* eslint-disable @typescript-eslint/no-unused-vars */
import 'fake-indexeddb/auto';

import * as rxjs from 'rxjs';
import {
  firstValueFrom,
  Subject,
  take,
  toArray,
} from 'rxjs';
import { z } from 'zod';

import {
  createPointer,
  createSchema,
  delay,
  Instant,
  SyncResponse,
  WebSocketFactory,
} from '@borda/client';

import * as lib from '../../../client/src/lib';
import * as utils from '../../src/lib/utils';

// global mocks
global.structuredClone = jest.fn((data) => data);

const tick = (ms = 0) => {
  jest.advanceTimersByTime(ms);
};

jest.mock('../../../client/src/lib/fetcher');
jest.mock('../../src/lib/utils', () => ({
  ...jest.requireActual('../../src/lib/utils'),
  isServer: jest.fn().mockReturnValue(false),
}));

describe('Instant Client', () => {
  const UserSchema = createSchema('users', {
    name: z.string(),
    posts: z.array(z.string()).optional(),
  });

  const PostSchema = createSchema('posts', {
    title: z.string(),
    content: z.string(),
    author: z.string(),
    _p_user: z.string(),
  });

  const schema = {
    users: UserSchema,
    posts: PostSchema,
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
      author: createPointer('users', 'objId0507'),
      _p_user: createPointer('users', 'objId0507'),
    },
    {
      _id: 'post11111',
      _created_at: '2020-07-28T03:08:41.768Z',
      _updated_at: '2020-07-28T03:08:41.768Z',
      title: 'Post 1',
      content: 'Hello world',
      author: createPointer('users', 'objId2807'),
      _p_user: createPointer('users', 'objId2807'),
    },
  ];

  let insta: Instant<typeof schema>;
  let fetcherSpy: jest.SpyInstance;
  let worker: any;

  beforeEach(async () => {
    insta = new Instant({
      schema,
      name: 'InstantTest',
      version: 1,
      inspect: true,
      serverURL: 'http://localhost:1337',
      session: '1337',
      user: '420',
      index: {
        users: ['name'],
      },
    });

    await insta.ready();

    // mock worker
    worker = {
      onmessage: jest.fn(),
      postMessage: async (payload: string) => {
        // @ts-ignore
        return await insta.worker()({ data: payload });
      },
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
        return Promise.resolve({});
      }
    );
  });

  afterEach(async () => {
    // insta.db.close({
    //   disableAutoOpen: true,
    // });
    // await insta.db.delete({
    //   disableAutoOpen: true,
    // });
    await insta.destroy();
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

  test('throw error if trying to access a non initialized db', async () => {
    const insta = new Instant({
      schema,
      name: 'InstantTest',
      inspect: true,
      serverURL: 'http://localhost:1337',
    });

    await expect(async () => {
      await insta.db.table('users').toArray();
    }).rejects.toThrow(
      'Database not initialized. Try awaiting `ready()` first.'
    );
  });

  test('throw any error on ready', async () => {
    const insta = new Instant({
      schema,
      name: 'InstantTest',
      inspect: true,
      serverURL: 'http://localhost:1337',
    });

    // mock isServer to throw an error just for the sake of the test
    const isServerSpy = jest.spyOn(utils, 'isServer').mockImplementation(() => {
      throw new Error('test');
    });

    await expect(async () => {
      await insta.ready();
    }).rejects.toThrow('test');

    isServerSpy.mockRestore();
  });

  test('simple query', async () => {
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

  test('query with two sided tables', async () => {
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

  test('nested query with $by directive', async () => {
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

  test('nested query without $by directive', async () => {
    const posts2 = [
      {
        _id: 'post11112',
        _created_at: '2022-07-05T03:08:41.768Z',
        _updated_at: '2022-07-05T03:08:41.768Z',
        title: 'Post 2',
        content: 'Ei gentiii chegueii',
        _p_user: createPointer('users', 'objId0507'),
      },
      {
        _id: 'post11111',
        _created_at: '2020-07-28T03:08:41.768Z',
        _updated_at: '2020-07-28T03:08:41.768Z',
        title: 'Post 1',
        content: 'Hello world',
        _p_user: createPointer('users', 'objId2807'),
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

    // @ts-ignore
    expect(result.users[0].posts).toHaveLength(1);
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
              _p_user: 'users$objId2807',
            },
          ],
        },
      ],
    });
  });

  test('sync batch create records', async () => {
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
        } as SyncResponse);
      }
    );

    await insta.sync({
      session: '1337',
      user: '420',
    });

    // check if data was updated
    const updatedUser = await insta.db.table('users').get('objId1337');

    expect(updatedUser.name).toBe('John Doez');

    // Clean up
    fetcherSpy.mockRestore();
  });

  test('sync batch update records', async () => {
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
        } as SyncResponse);
      }
    );

    await insta.sync({
      session: '1337',
      user: '420',
    });

    // check if data was updated
    const updatedUser = await insta.db.table('users').get('objId2222');
    expect(updatedUser.name).toBe('Teobs');

    // Clean up
    fetcherSpy.mockRestore();
  });

  test('sync batch delete records', async () => {
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
        } as SyncResponse);
      }
    );

    await insta.sync({
      session: '1337',
      user: '420',
    });

    // check if data was updated
    const updatedUser = await insta.db.table('users').get('objId1337');
    expect(updatedUser).toBeUndefined();

    // Clean up
    fetcherSpy.mockRestore();
  });

  test('query filter users using $regex', async () => {
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

  test('query filter users using $regex with $options i by default', async () => {
    const { users } = await insta.query({
      users: {
        $filter: {
          name: { $regex: 'Te' },
        },
      },
    });

    expect(users).toHaveLength(1);
    expect(users[0].name).toBe('Teobaldo José');
  });

  test('query filter users using $or', async () => {
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

  test('query filter users using $eq', async () => {
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

  test('query sort using no index should throw', async () => {
    const insta2 = new Instant({
      schema,
      name: 'InstantTest2',
      serverURL: 'http://localhost:1337',
      session: '1337',
      index: {
        posts: ['title'],
      },
    });

    await insta2.ready();

    await expect(
      insta2.query({
        users: {
          $sort: {
            name: 1,
          },
        },
      })
    ).rejects.toThrow('KeyPath [name] on object store users is not indexed');

    await insta2.destroy();
  });

  test('calculate all collections usage', async () => {
    const realGlobalNavigatorStorage = global.navigator.storage;
    // Mock the entire navigator.storage object
    Object.defineProperty(global.navigator, 'storage', {
      value: {
        estimate: jest.fn().mockResolvedValue({
          usageDetails: {
            indexedDB: 10000000,
          },
        }),
      },
      configurable: true,
    });

    const usage = await insta.usage();
    expect(usage).toBe('9.54 MB');

    // test no support
    Object.defineProperty(global.navigator, 'storage', {
      value: {
        estimate: jest.fn().mockResolvedValue(null),
      },
      configurable: true,
    });

    const usage2 = await insta.usage();
    expect(usage2).toBe('0.00 MB');

    // Clean up the mock
    Object.defineProperty(global.navigator, 'storage', {
      value: realGlobalNavigatorStorage,
      configurable: true,
    });
  });

  test('calculate a given collection usage', async () => {
    const realGlobalNavigatorStorage = global.navigator.storage;
    // Mock the entire navigator.storage object
    Object.defineProperty(global.navigator, 'storage', {
      value: {
        estimate: jest.fn().mockResolvedValue({
          usageDetails: {
            indexedDB: 10000000,
          },
        }),
      },
      configurable: true,
    });

    const usage = await insta.usage('users');
    expect(usage).toBe('0.00 MB');

    // Clean up the mock
    Object.defineProperty(global.navigator, 'storage', {
      value: realGlobalNavigatorStorage,
      configurable: true,
    });
  });

  test("worker should throw if there's no token", async () => {
    try {
      // @ts-ignore
      await insta.worker()({
        data: JSON.stringify({}),
      });
    } catch (error) {
      expect(error).toBe('No token provided');
    }
  });

  test('worker should run batch sync', async () => {
    const insta2 = new Instant({
      schema,
      name: 'InstantTest2',
      serverURL: 'http://localhost:1337',
      session: '1337',
    });

    // @ts-ignore
    const runBatchWorkerSpy = jest.spyOn(insta2, 'runBatchWorker');
    await insta2.ready();

    // @ts-ignore
    await insta2.worker()({
      data: JSON.stringify({
        token: '1337',
        sync: 'batch',
      }),
    });

    expect(runBatchWorkerSpy).toHaveBeenCalled();

    // clean up
    runBatchWorkerSpy.mockRestore();

    await insta2.destroy();
  });

  test('worker should run live sync', async () => {
    const insta2 = new Instant({
      schema,
      name: 'InstantTest2',
      serverURL: 'http://localhost:1337',
      session: '1337',
    });

    const runLiveWorkerSpy = jest
      // @ts-ignore
      .spyOn(insta2, 'runLiveWorker')
      // @ts-ignore
      .mockResolvedValue();

    await insta2.ready();

    // @ts-ignore
    await insta2.worker()({
      data: JSON.stringify({
        token: '1337',
        sync: 'live',
      }),
    });

    expect(runLiveWorkerSpy).toHaveBeenCalled();

    // clean up
    runLiveWorkerSpy.mockRestore();
    await insta2.destroy();
  });

  test('mutate add', async () => {
    const user = await insta.mutate('users').add({
      name: 'Elon Musk',
    });

    expect(user).toEqual({
      _id: expect.any(String),
      _uuid: expect.any(String),
      _sync: 1,
      _created_at: expect.any(String),
      _updated_at: expect.any(String),
      _created_by: expect.any(String),
      _updated_by: expect.any(String),
      name: 'Elon Musk',
    });

    const { users } = await insta.query({
      users: {
        $filter: {
          name: { $eq: 'Elon Musk' },
        },
      },
    });

    expect(users).toHaveLength(1);
    expect(users[0].name).toBe('Elon Musk');
  });

  test('mutate delete', async () => {
    await insta.mutate('users').delete('objId2222');
    const deletedUser = await insta.db.table('users').get('objId2222');
    expect(deletedUser._expires_at).toBeDefined();
  });

  test('query filter with nullish $eq', async () => {
    const { users } = await insta.query({
      users: {
        $filter: {
          _sync: { $eq: null },
        },
      },
    } as unknown as any);

    expect(users).toHaveLength(0);
  });

  test('query filter with $eq zero', async () => {
    const { users } = await insta.query({
      users: {
        $filter: {
          _sync: { $eq: 0 },
        },
      },
    } as unknown as any);

    expect(users).toHaveLength(0);
  });

  test('query filter and sort using _update_at by default', async () => {
    const { users } = await insta.query({
      users: {},
    });

    expect(users[0].name).toBe('Elis');

    // add new user
    await insta.mutate('users').add({
      name: 'Tunico',
    });

    const { users: usersUpdated } = await insta.query({
      users: {},
    });

    expect(usersUpdated[0].name).toBe('Tunico');
  });

  test('query filter $regex with $options `i` by default', async () => {
    const { users } = await insta.query({
      users: {
        $filter: {
          name: { $regex: 't' },
        },
      },
    });

    expect(users).toHaveLength(2);
    expect(users[0].name).toBe('Tobias Afonso');
    expect(users[1].name).toBe('Teobaldo José');
  });

  test('query filter using $sort', async () => {
    const { users } = await insta.query({
      users: {
        $sort: {
          name: 1,
        },
      },
    });
    expect(users[0].name).toBe('Elis');
  });

  test('query filter using $sort + $filter', async () => {
    const { users } = await insta.query({
      users: {
        $sort: {
          name: -1,
        },
        $filter: {
          name: { $regex: 't' },
        },
      },
    });
    expect(users[0].name).toBe('Tobias Afonso');
  });

  test('query filter can also be a function', async () => {
    const { users } = await insta.query({
      users: {
        $filter: (user) => user.name.startsWith('T'),
      },
    });

    expect(users).toHaveLength(2);
    expect(users[0].name).toBe('Tobias Afonso');
    expect(users[1].name).toBe('Teobaldo José');
  });

  test('syncing stream should emit false when no sync activities are present', async () => {
    const syncingValue = await firstValueFrom(insta.syncing);
    expect(syncingValue).toBe(false);
  });

  test('syncing stream should emit true when there is an incomplete oldest sync activity', async () => {
    const syncHistory: boolean[] = [];

    insta.syncing.subscribe((syncing) => {
      console.log('syncing', syncing);
      syncHistory.push(syncing);
    });

    await insta.db.table('_sync').add({
      collection: 'users',
      activity: 'oldest',
      status: 'incomplete',
      synced: new Date().toISOString(),
      count: 50000,
    });

    await delay(100);
    expect(syncHistory).toEqual([false, true]);
  });

  test('syncing stream should emit false when all sync activities are complete', async () => {
    const syncHistory: boolean[] = [];

    insta.syncing.subscribe((syncing) => {
      syncHistory.push(syncing);
    });

    await insta.db.table('_sync').add({
      collection: 'users',
      activity: 'oldest',
      status: 'complete',
      synced: new Date().toISOString(),
      count: 42,
    });

    await delay(100);
    expect(syncHistory).toEqual([false, false]);
  });

  test('skip pending mutations if busy', async () => {
    const insta2 = new Instant({
      schema,
      inspect: true,
      name: 'InstantTest2',
      serverURL: 'http://localhost:1337',
      session: '1337',
      user: '420',
    });

    await insta2.ready();

    // @ts-ignore
    const runMutationWorkerSpy = jest.spyOn(insta2, 'runMutationWorker');

    await insta2.mutate('users').add({
      name: 'Elon Musk',
    });

    await Promise.allSettled([
      // @ts-ignore
      insta2.runPendingMutations(),
      // @ts-ignore
      insta2.runPendingMutations(),
      // @ts-ignore
      insta2.runPendingMutations(),
    ]);

    expect(runMutationWorkerSpy).toHaveBeenCalledTimes(1);
    await insta2.destroy();
  });

  test('skip pending mutations if validation fails', async () => {
    const insta2 = new Instant({
      schema,
      inspect: true,
      name: 'InstantTest2',
      serverURL: 'http://localhost:1337',
      session: '1337',
      user: '420',
    });

    await insta2.ready();

    // @ts-ignore
    const runMutationWorkerSpy = jest.spyOn(insta2, 'runMutationWorker');

    await insta2.mutate('users').add({
      name: 1,
    } as any);

    // @ts-ignore
    await insta2.runPendingMutations();

    await insta2.mutate('users').add({
      name: 'Elon Musk',
      age: 420,
    } as any);

    // @ts-ignore
    await insta2.runPendingMutations();

    expect(runMutationWorkerSpy).not.toHaveBeenCalled();
    await insta2.destroy();
  });

  test('skip pending pointers if busy', async () => {
    const insta2 = new Instant({
      schema,
      inspect: true,
      name: 'InstantTest2',
      serverURL: 'http://localhost:1337',
      session: '1337',
      user: '420',
    });

    await insta2.ready();

    const querySpy = jest.spyOn(insta2, 'query');

    await insta2.mutate('posts').add({
      title: 'My forty-second post',
      _p_user: 'users$420',
    });

    await Promise.allSettled([
      // @ts-ignore
      insta2.runPendingPointers(),
      // @ts-ignore
      insta2.runPendingPointers(),
      // @ts-ignore
      insta2.runPendingPointers(),
      // @ts-ignore
      insta2.runPendingPointers(),
    ]);

    expect(querySpy).toHaveBeenCalledTimes(2); // the total of collections to query against
    await insta2.destroy();
  });

  test('deal with pending pointers created locally', async () => {
    const insta2 = new Instant({
      schema,
      inspect: true,
      name: 'InstantTest2',
      serverURL: 'http://localhost:1337',
      session: '1337',
      user: '420',
    });

    await insta2.ready();

    const querySpy = jest.spyOn(insta2, 'query');

    await insta2.db.table('users').add({
      _id: 'a1b2c3d4e', // external id
      _uuid: '1111-2222-3333-4444', // local id
      name: 'John Doe',
    });

    const post = await insta2.mutate('posts').add({
      title: 'My offline post',
      _p_user: 'users$1111-2222-3333-4444',
    });

    // @ts-ignore
    await insta2.runPendingPointers();

    expect(querySpy).toHaveBeenLastCalledWith({
      users: {
        $filter: {
          _uuid: {
            $eq: '1111-2222-3333-4444',
          },
        },
      },
    });

    const updatedPost = await insta2.db.table('posts').get(post._id as string);

    expect(updatedPost._p_user).toBe('users$a1b2c3d4e');

    await insta2.destroy();
  });

  test('run pending created mutations', async () => {
    const runMutationWorkerSpy = jest
      // @ts-ignore
      .spyOn(insta, 'runMutationWorker')
      // @ts-ignore
      .mockResolvedValue();

    const newUser = await insta.mutate('users').add({
      name: 'John Doez',
    });

    // @ts-ignore
    await insta.runPendingMutations();

    const data = await insta.db.table('users').get(newUser._id as string);

    expect(runMutationWorkerSpy).toHaveBeenCalledTimes(1);
    expect(runMutationWorkerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: expect.stringContaining('sync/users'),
      })
    );

    expect(data.name).toBe('John Doez');

    await insta.destroy();
  });

  test('run pending updated mutations', async () => {
    const runMutationWorkerSpy = jest
      // @ts-ignore
      .spyOn(insta, 'runMutationWorker')
      // @ts-ignore
      .mockResolvedValue();

    await insta.mutate('users').update('objId2222', {
      name: 'John Doer',
    });

    // @ts-ignore
    await insta.runPendingMutations();

    const data = await insta.db.table('users').get('objId2222');

    expect(runMutationWorkerSpy).toHaveBeenCalledTimes(1);
    expect(runMutationWorkerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PUT',
        url: expect.stringContaining('sync/users/objId2222'),
      })
    );

    expect(data.name).toBe('John Doer');

    await insta.destroy();
  });

  test('run pending deleted mutations', async () => {
    const runMutationWorkerSpy = jest
      // @ts-ignore
      .spyOn(insta, 'runMutationWorker')
      // @ts-ignore
      .mockResolvedValue();

    await insta.mutate('users').delete('objId2222');

    // @ts-ignore
    await insta.runPendingMutations();

    const data = await insta.db.table('users').get('objId2222');

    expect(runMutationWorkerSpy).toHaveBeenCalledTimes(1);
    expect(runMutationWorkerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'DELETE',
        url: expect.stringContaining('sync/users/objId2222'),
      })
    );

    expect(data._expires_at).toBeDefined();

    await insta.destroy();
  });

  test('batch worker shoud initialize db if not initialized', async () => {
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
                name: 'John Doex',
              },
            },
          ],
        } as SyncResponse);
      }
    );

    const insta2 = new Instant({
      schema,
      name: 'InstantTest2',
      serverURL: 'http://localhost:1337',
      session: '1337',
      user: '420',
    });

    // @ts-ignore
    await insta2.runBatchWorker({
      url: 'http://localhost:1337',
      token: '1337',
      headers: {},
      params: {},
    });

    expect(insta2.db).toBeDefined();

    fetcherSpy.mockRestore();
    await insta2.destroy();
  });

  test('batch worker shoud accept custom params', async () => {
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
                name: 'John Doex',
              },
            },
          ],
        } as SyncResponse);
      }
    );

    const insta2 = new Instant({
      schema,
      name: 'InstantTest2',
      serverURL: 'http://localhost:1337',
      session: '1337',
      user: '420',
    });

    // @ts-ignore
    await insta2.runBatchWorker({
      url: `/sync/users?activity=recent`,
      token: '1337',
      headers: {},
      params: {
        org: 'a1b2c3d4e',
      },
    });

    expect(fetcherSpy).toHaveBeenCalledWith(
      '/sync/users?activity=recent&org=a1b2c3d4e',
      expect.objectContaining({
        method: 'GET',
        headers: {
          authorization: `Bearer 1337`,
        },
      })
    );

    fetcherSpy.mockRestore();
    await insta2.destroy();
  });

  test('batch worker shoud account for older documents', async () => {
    const fetcherSpy = jest.spyOn(lib, 'fetcher').mockImplementation(
      // @ts-ignore
      (url, options) => {
        return Promise.resolve({
          activity: 'oldest',
          collection: 'users',
          count: 1,
          synced: new Date().toISOString(),
          data: [
            {
              status: 'created',
              value: {
                _id: 'objId1337',
                _created_at: '2024-08-26T03:49:47.352Z',
                _updated_at: '2024-08-26T03:49:47.352Z',
                name: 'John Doex',
              },
            },
          ],
        } as SyncResponse);
      }
    );

    const insta2 = new Instant({
      schema,
      name: 'InstantTest2',
      serverURL: 'http://localhost:1337',
      session: '1337',
      user: '420',
    });

    // @ts-ignore
    await insta2.runBatchWorker({
      url: `/sync/users?activity=oldest`,
      token: '1337',
      headers: {},
      params: {
        org: 'a1b2c3d4e',
      },
    });

    expect(fetcherSpy).toHaveBeenCalledWith(
      '/sync/users?activity=oldest&org=a1b2c3d4e',
      expect.objectContaining({
        method: 'GET',
        headers: {
          authorization: `Bearer 1337`,
        },
      })
    );

    fetcherSpy.mockRestore();
    await insta2.destroy();
  });

  describe('online stream', () => {
    let originalAddEventListener: typeof window.addEventListener;
    let originalRemoveEventListener: typeof window.removeEventListener;
    let originalNavigatorOnLine: boolean;
    let eventListeners: { [key: string]: Function[] };

    beforeEach(() => {
      originalAddEventListener = window.addEventListener;
      originalRemoveEventListener = window.removeEventListener;
      originalNavigatorOnLine = navigator.onLine;

      eventListeners = {};

      // Mock addEventListener
      window.addEventListener = jest.fn((event, callback) => {
        if (!eventListeners[event]) {
          eventListeners[event] = [];
        }
        eventListeners[event].push(callback as Function);
      });

      // Mock removeEventListener
      window.removeEventListener = jest.fn((event, callback) => {
        if (eventListeners[event]) {
          eventListeners[event] = eventListeners[event].filter(
            (cb) => cb !== callback
          );
        }
      });

      // Mock navigator.onLine
      Object.defineProperty(navigator, 'onLine', {
        get: jest.fn(() => true),
        configurable: true,
      });
    });

    afterEach(() => {
      window.addEventListener = originalAddEventListener;
      window.removeEventListener = originalRemoveEventListener;
      Object.defineProperty(navigator, 'onLine', {
        value: originalNavigatorOnLine,
        configurable: true,
        writable: true,
      });
      jest.restoreAllMocks();
    });

    function dispatchEvent(eventName: string) {
      if (eventListeners[eventName]) {
        eventListeners[eventName].forEach((callback) =>
          callback(new Event(eventName))
        );
      }
    }

    test('should emit initial online status', (done) => {
      const insta = new Instant({
        schema,
        name: 'InstantTest',
        serverURL: 'http://localhost:1337',
      });

      insta.online.pipe(take(1)).subscribe((isOnline) => {
        expect(isOnline).toBe(true);
        done();
      });
    });

    test('should emit online status changes', (done) => {
      const insta = new Instant({
        schema,
        name: 'InstantTest',
        serverURL: 'http://localhost:1337',
      });

      insta.online.pipe(take(3), toArray()).subscribe((statuses) => {
        expect(statuses).toEqual([true, false, true]);
        done();
      });

      // Simulate offline event
      dispatchEvent('offline');

      // Simulate online event
      dispatchEvent('online');
    });

    test('should not emit duplicate statuses', (done) => {
      const insta = new Instant({
        schema,
        name: 'InstantTest',
        serverURL: 'http://localhost:1337',
      });

      insta.online.pipe(take(3), toArray()).subscribe((statuses) => {
        expect(statuses).toEqual([true, false, true]);
        done();
      });

      // Simulate multiple offline events
      dispatchEvent('offline');
      dispatchEvent('offline');

      // Simulate multiple online events
      dispatchEvent('online');
      dispatchEvent('online');
    });

    test('should call sync methods when coming back online after being offline', async () => {
      const worker = {
        onmessage: jest.fn(),
        terminate: jest.fn(),
        postMessage: async (payload: string) =>
          // @ts-ignore
          await insta.worker()({ data: payload }),
      };

      const insta2 = new Instant({
        schema,
        name: 'InstantTest2',
        serverURL: 'http://localhost:1337',
        session: '1337',
      });

      // Set the mocked worker
      insta2.setWorker({ worker } as any);

      await insta2.ready();

      const syncBatchRecentSpy = jest.spyOn(insta2, 'syncBatch' as any);
      const syncBatchOldestSpy = jest.spyOn(insta2, 'syncBatch' as any);

      dispatchEvent('offline');
      dispatchEvent('online');

      // Check if syncBatch methods were called
      expect(syncBatchRecentSpy).toHaveBeenCalledWith('recent');
      expect(syncBatchOldestSpy).toHaveBeenCalledWith('oldest');

      expect(syncBatchRecentSpy).toHaveBeenCalledTimes(2);
      expect(syncBatchOldestSpy).toHaveBeenCalledTimes(2);

      // Clean up
      syncBatchRecentSpy.mockRestore();
      syncBatchOldestSpy.mockRestore();

      // await insta2.destroy(); // this breaks this test
    });
  });

  describe('online stream (web worker)', () => {
    let isServerSpy: jest.SpyInstance;
    let eventTarget: EventTarget;

    beforeEach(() => {
      isServerSpy = jest.spyOn(utils, 'isServer').mockReturnValue(true);

      eventTarget = new EventTarget();
      jest.spyOn(global, 'EventTarget').mockImplementation(() => eventTarget);
    });

    afterEach(() => {
      isServerSpy.mockRestore();
      jest.restoreAllMocks();
    });

    test('should use EventTarget from within the webworker', (done) => {
      const insta = new Instant({
        schema,
        name: 'InstantTest',
        serverURL: 'http://localhost:1337',
      });

      insta.online.pipe(take(3), toArray()).subscribe((statuses) => {
        expect(statuses).toEqual([true, false, true]);
        done();
      });

      // Simulate offline event
      eventTarget.dispatchEvent(new Event('offline'));

      // Simulate online event
      eventTarget.dispatchEvent(new Event('online'));
    });

    test('should not emit duplicate statuses on server-side', (done) => {
      const insta = new Instant({
        schema,
        name: 'InstantTest',
        serverURL: 'http://localhost:1337',
      });

      insta.online.pipe(take(3), toArray()).subscribe((statuses) => {
        expect(statuses).toEqual([true, false, true]);
        done();
      });

      // Simulate multiple offline events
      eventTarget.dispatchEvent(new Event('offline'));
      eventTarget.dispatchEvent(new Event('offline'));

      // Simulate multiple online events
      eventTarget.dispatchEvent(new Event('online'));
      eventTarget.dispatchEvent(new Event('online'));
    });
  });

  describe('Task Scheduler', () => {
    let isServerSpy: jest.SpyInstance;
    let intervalSpy: jest.SpyInstance;
    let allSettledSpy: jest.SpyInstance;
    let intervalSubject: Subject<number>;

    beforeEach(() => {
      isServerSpy = jest.spyOn(utils, 'isServer').mockReturnValue(true);

      intervalSubject = new Subject<number>();
      intervalSpy = jest
        .spyOn(rxjs, 'interval')
        .mockReturnValue(intervalSubject);

      allSettledSpy = jest.spyOn(Promise, 'allSettled').mockResolvedValue([]);

      jest.useFakeTimers();
    });

    afterEach(() => {
      isServerSpy.mockRestore();
      intervalSpy.mockRestore();
      allSettledSpy.mockRestore();
      jest.restoreAllMocks();
      jest.useRealTimers();
    });

    test('should schedule tasks when isServer is true', async () => {
      const insta2 = new Instant({
        schema,
        name: 'InstantTest2',
        serverURL: 'http://localhost:1337',
      });

      await insta2.ready();

      expect(isServerSpy).toHaveBeenCalled();
      expect(intervalSpy).toHaveBeenCalledWith(1000);

      intervalSubject.next(0);

      expect(allSettledSpy).toHaveBeenCalled();
      expect(allSettledSpy).toHaveBeenCalledWith([
        expect.any(Promise),
        expect.any(Promise),
      ]);

      // await insta2.destroy(); // this breaks this test
    });
  });

  describe('Batch Sync Scheduler', () => {
    let isServerSpy: jest.SpyInstance;

    beforeEach(() => {
      isServerSpy = jest.spyOn(utils, 'isServer').mockReturnValue(true);
      jest.useFakeTimers();
    });

    afterEach(() => {
      isServerSpy?.mockRestore();
      jest.useRealTimers();
      jest.restoreAllMocks();
    });

    test('run batch worker through sync scheduler', async () => {
      const insta3 = new Instant({
        schema,
        name: 'InstantTest3',
        serverURL: 'http://localhost:1337',
        buffer: 1,
      });

      const runBatchWorkerSpy = jest
        // @ts-ignore
        .spyOn(insta3, 'runBatchWorker')
        // @ts-ignore
        .mockResolvedValue({});

      await insta3.ready();
      // @ts-ignore
      insta3.addBatch({
        collection: 'users',
        synced: new Date().toISOString(),
        activity: 'recent',
        token: 'some-token',
        headers: {},
        params: {},
      });

      tick(100);

      expect(runBatchWorkerSpy).toHaveBeenCalled();
      expect(runBatchWorkerSpy).toHaveBeenCalledTimes(1);

      runBatchWorkerSpy.mockClear();
      await insta3.destroy();
    });
  });

  describe('Live Sync', () => {
    let isServerSpy: jest.SpyInstance;

    beforeEach(() => {
      isServerSpy = jest.spyOn(utils, 'isServer').mockReturnValue(true);
    });

    afterEach(() => {
      isServerSpy.mockRestore();
      jest.restoreAllMocks();
    });

    test('run live worker with custom params and headers', async () => {
      const insta = new Instant({
        schema,
        name: 'InstantTest1',
        serverURL: 'http://localhost:8080',
        session: '1337',
        user: '',
      });

      const buildWebSocketSpy = jest.spyOn(insta, 'buildWebSocket' as any);

      await insta.ready();
      // @ts-ignore
      await insta.runLiveWorker({
        url: 'ws://localhost:8080/sync/live?session=1337',
        params: {
          org: 'a1b2c3d4e',
        },
        headers: {
          timezone: 'GMT',
        },
      });

      expect(buildWebSocketSpy).toHaveBeenCalled();
      expect(buildWebSocketSpy).toHaveBeenCalledWith(
        'ws://localhost:8080/sync/live?session=1337&org=a1b2c3d4e&timezone=GMT'
      );

      // clean up
      buildWebSocketSpy.mockRestore();
      await insta.destroy();
    });

    test('process externally created documents', async () => {
      const insta = new Instant({
        schema,
        name: 'InstantTest2',
        serverURL: 'http://localhost:8080',
        session: '1337',
        user: '',
      });

      const buildWebSocketSpy = jest
        .spyOn(insta, 'buildWebSocket' as any)
        .mockImplementation((url) => {
          return (factory: WebSocketFactory) => {
            const { onConnect, onOpen, onError, onClose, onMessage } = factory;
            onMessage(
              null as any,
              {
                data: JSON.stringify({
                  collection: 'users',
                  status: 'created',
                  value: {
                    _id: 'a2b3c4d5e6',
                    name: 'John Doey',
                  },
                }),
              } as any
            );
          };
        });

      await insta.ready();
      // @ts-ignore
      await insta.runLiveWorker({
        url: 'ws://localhost:8080/sync/live?session=1337',
        params: {
          org: 'a1b2c3d4e',
        },
        headers: {
          timezone: 'GMT',
        },
      });

      const data = await insta.db.table('users').get('a2b3c4d5e6');

      expect(data).toMatchObject({
        name: 'John Doey',
        _id: 'a2b3c4d5e6',
        _sync: 0,
      });

      // clean up
      buildWebSocketSpy.mockRestore();
      await insta.destroy();
    });

    test('process externally updated documents', async () => {
      const insta = new Instant({
        schema,
        name: 'InstantTest2',
        serverURL: 'http://localhost:8080',
        session: '1337',
        user: '',
      });

      const buildWebSocketSpy = jest
        .spyOn(insta, 'buildWebSocket' as any)
        .mockImplementation((url) => {
          return (factory: WebSocketFactory) => {
            const { onConnect, onOpen, onError, onClose, onMessage } = factory;
            onMessage(
              null as any,
              {
                data: JSON.stringify({
                  collection: 'users',
                  status: 'updated',
                  value: {
                    _id: 'a1b2c3d4e',
                    name: 'John DoeY',
                  },
                }),
              } as any
            );
          };
        });

      await insta.ready();

      // add a user locally
      await insta.db.table('users').add({
        _id: 'a1b2c3d4e',
        name: 'John DoeX',
      });

      // @ts-ignore
      await insta.runLiveWorker({
        url: 'ws://localhost:8080/sync/live?session=1337',
        params: {
          org: 'a1b2c3d4e',
        },
        headers: {
          timezone: 'GMT',
        },
      });

      await delay(10);

      const data = await insta.db.table('users').get('a1b2c3d4e');

      expect(data).toMatchObject({
        name: 'John DoeY',
        _id: 'a1b2c3d4e',
        _sync: 0,
      });

      // clean up
      buildWebSocketSpy.mockRestore();
      await insta.destroy();
    });

    test('process locally created documents by the owner', async () => {
      const insta = new Instant({
        schema,
        name: 'InstantTest4',
        serverURL: 'http://localhost:8080',
        session: '1337',
        user: '7331',
      });

      await insta.ready();

      // add a user locally
      const { _id, _uuid } = await insta.mutate('users').add({
        name: 'John DoeX',
      });
      expect(_id).toEqual(_uuid);

      const buildWebSocketSpy = jest
        .spyOn(insta, 'buildWebSocket' as any)
        .mockImplementation((url) => {
          return (factory: WebSocketFactory) => {
            const { onConnect, onOpen, onError, onClose, onMessage } = factory;
            onMessage(
              null as any,
              {
                data: JSON.stringify({
                  collection: 'users',
                  status: 'created',
                  value: {
                    _uuid,
                    _id: 'a2b3c4d5e6', // actual id from the server
                    name: 'John DoeX',
                  },
                }),
              } as any
            );
          };
        });

      // @ts-ignore
      await insta.runLiveWorker({
        url: 'ws://localhost:8080/sync/live?session=1337',
        params: {
          org: 'a1b2c3d4e',
        },
        headers: {
          timezone: 'GMT',
        },
      });

      await delay(0);
      const data = await insta.db.table('users').get('a2b3c4d5e6');

      expect(data).toMatchObject({
        name: 'John DoeX',
        _id: 'a2b3c4d5e6', // actual id from the server
        _uuid, // local id
        _sync: 0,
      });

      // clean up
      buildWebSocketSpy.mockRestore();
      await insta.destroy();
    });

    test('process locally created documents by other clients', async () => {
      const insta = new Instant({
        schema,
        name: 'InstantTest3',
        serverURL: 'http://localhost:8080',
        session: '1337',
        user: '',
      });

      const buildWebSocketSpy = jest
        .spyOn(insta, 'buildWebSocket' as any)
        .mockImplementation((url) => {
          return (factory: WebSocketFactory) => {
            const { onConnect, onOpen, onError, onClose, onMessage } = factory;
            onMessage(
              null as any,
              {
                data: JSON.stringify({
                  collection: 'users',
                  status: 'created',
                  value: {
                    _id: 'a2b3c4d5e6',
                    _uuid: 'a1b2c3-d4e5-f6g7-h8i9',
                    name: 'John Doez',
                  },
                }),
              } as any
            );
          };
        });

      await insta.ready();

      // @ts-ignore
      await insta.runLiveWorker({
        url: 'ws://localhost:8080/sync/live?session=1337',
        params: {
          org: 'a1b2c3d4e',
        },
        headers: {
          timezone: 'GMT',
        },
      });

      await delay(10);
      const data = await insta.db.table('users').get('a2b3c4d5e6');

      expect(data).toMatchObject({
        name: 'John Doez',
        _id: 'a2b3c4d5e6',
        _uuid: 'a1b2c3-d4e5-f6g7-h8i9',
        _sync: 0,
      });

      // clean up
      buildWebSocketSpy.mockRestore();
      await insta.destroy();
    });

    test('should create a new entry if entry does not exist on process update', async () => {
      const insta = new Instant({
        schema,
        name: 'InstantTest1',
        serverURL: 'http://localhost:8080',
        session: '1337',
        user: '',
      });

      const buildWebSocketSpy = jest
        .spyOn(insta, 'buildWebSocket' as any)
        .mockImplementation((url) => {
          return (factory: WebSocketFactory) => {
            const { onConnect, onOpen, onError, onClose, onMessage } = factory;
            onMessage(
              null as any,
              {
                data: JSON.stringify({
                  collection: 'users',
                  status: 'updated',
                  value: {
                    _id: 'a2b3c4d5e6',
                    _uuid: 'a1b2c3-d4e5-f6g7-h8i9',
                    name: 'John DoeK',
                  },
                }),
              } as any
            );
          };
        });

      await insta.ready();

      // @ts-ignore
      await insta.runLiveWorker({
        url: 'ws://localhost:8080/sync/live?session=1337',
        params: {
          org: 'a1b2c3d4e',
        },
        headers: {
          timezone: 'GMT',
        },
      });

      await delay(10);
      const data = await insta.db.table('users').get('a2b3c4d5e6');

      expect(data).toMatchObject({
        name: 'John DoeK',
        _id: 'a2b3c4d5e6',
        _sync: 0,
      });

      // clean up
      buildWebSocketSpy.mockRestore();
      await insta.destroy();
    });

    test('use the updated fields on process update', async () => {
      const insta = new Instant({
        schema,
        name: 'InstantTest1',
        serverURL: 'http://localhost:8080',
        session: '1337',
        user: '',
      });

      const buildWebSocketSpy = jest
        .spyOn(insta, 'buildWebSocket' as any)
        .mockImplementation((url) => {
          return (factory: WebSocketFactory) => {
            const { onConnect, onOpen, onError, onClose, onMessage } = factory;
            onMessage(
              null as any,
              {
                data: JSON.stringify({
                  collection: 'users',
                  status: 'updated',
                  updatedFields: {
                    name: 'John DoeL',
                  },
                  value: {
                    _id: 'a2b3c4d5e6',
                    name: 'John DoeL',
                  },
                }),
              } as any
            );
          };
        });

      await insta.ready();

      // add the user locally
      await insta.db.table('users').add({
        _id: 'a2b3c4d5e6',
        name: 'John DoeJ',
      });

      // @ts-ignore
      await insta.runLiveWorker({
        url: 'ws://localhost:8080/sync/live?session=1337',
        params: {
          org: 'a1b2c3d4e',
        },
        headers: {
          timezone: 'GMT',
        },
      });

      await delay(10);

      const data = await insta.db.table('users').get('a2b3c4d5e6');

      expect(data).toMatchObject({
        name: 'John DoeL',
        _id: 'a2b3c4d5e6',
        _sync: 0,
      });

      // clean up
      buildWebSocketSpy.mockRestore();
      await insta.destroy();
    });

    test('close websocket server on code 1000', async () => {
      const insta = new Instant({
        schema,
        name: 'InstantTest7',
        serverURL: 'http://localhost:8080',
        session: '1337',
        user: '7331',
      });

      await insta.ready();

      // @ts-ignore
      insta.wss = {
        close: jest.fn(),
      };

      const wssCloseSpy = jest
        // @ts-ignore
        .spyOn(insta.wss, 'close')
        // @ts-ignore
        .mockImplementation(() => {});

      const buildWebSocketSpy = jest
        .spyOn(insta, 'buildWebSocket' as any)
        .mockImplementation((url) => {
          return async (factory: WebSocketFactory) => {
            const { onConnect, onOpen, onError, onClose, onMessage } = factory;

            onClose(
              null as any,
              {
                code: 1000,
              } as any
            );
          };
        });

      // run live worker
      // @ts-ignore
      await insta.runLiveWorker({
        url: 'ws://localhost:8080/sync/live?session=1337',
        params: {
          org: 'a1b2c3d4e',
        },
        headers: {
          timezone: 'GMT',
        },
      });

      expect(wssCloseSpy).toHaveBeenCalled();

      // clean up
      buildWebSocketSpy.mockRestore();
      wssCloseSpy.mockRestore();
      await insta.destroy();
    });

    test('should retry on close', async () => {
      let count = 0;
      jest.useFakeTimers();
      const insta = new Instant({
        schema,
        name: 'InstantTest0',
        serverURL: 'http://localhost:8080',
        session: '1337',
        user: '',
        inspect: true,
      });

      const setTimeoutSpy = jest
        .spyOn(global, 'setTimeout')
        .mockImplementation((cb, ms) => {
          cb();
          return 1000 as any;
        });

      const buildWebSocketSpy = jest
        .spyOn(insta, 'buildWebSocket' as any)
        // @ts-ignore
        .mockImplementation((url) => {
          return (factory: WebSocketFactory) => {
            const { onConnect, onOpen, onError, onClose, onMessage } = factory;

            if (count <= 2) {
              onConnect(null as any);
              count++;
            }

            if (count < 2) {
              onClose(
                null as any,
                {
                  code: 1337,
                } as any
              );
            }
          };
        });

      await insta.ready();

      // run live worker
      // @ts-ignore
      await insta.runLiveWorker({
        url: 'ws://localhost:8080/sync/live?session=1337',
        params: {
          org: 'a1b2c3d4e',
        },
        headers: {
          timezone: 'GMT',
        },
      });

      tick(2000);

      expect(buildWebSocketSpy).toHaveBeenCalledTimes(2);

      // clean up
      buildWebSocketSpy.mockRestore();
      jest.useRealTimers();
      setTimeoutSpy.mockRestore();
      // await insta.destroy(); // this breaks this test
    });
  });
});
