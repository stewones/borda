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
  createObjectIdSchema,
  createPointer,
  delay,
  Instant,
  InstantSyncResponse,
} from '@borda/client';

import * as lib from '../../../client/src/lib';
import * as utils from '../../src/lib/utils';

// global mocks
global.structuredClone = jest.fn((data) => data);

const tick = (ms = 0) => {
  jest.advanceTimersByTime(ms);
};

const UserId = createObjectIdSchema('users');
const PostId = createObjectIdSchema('posts');
const CommentId = createObjectIdSchema('comments');

jest.mock('../../../client/src/lib/fetcher');
jest.mock('../../src/lib/utils', () => ({
  ...jest.requireActual('../../src/lib/utils'),
  isServer: jest.fn().mockReturnValue(false),
}));

describe('Instant Client', () => {
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
      _p_user: z.string(),
      title: z.string(),
      content: z.string(),
      author: z.string(),
    }),
    comments: z.object({
      _id: CommentId,
      _created_at: z.string(),
      _updated_at: z.string(),
      _p_user: z.string(),
      author: z.string(),
      posts: z.array(
        z.object({
          _id: PostId,
          _created_at: z.string(),
          _updated_at: z.string(),
          _p_user: z.string(),
          title: z.string(),
          content: z.string(),
          author: z.string(),
        })
      ),
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

  beforeEach(async () => {
    insta = new Instant({
      schema,
      name: 'InstantTest',
      inspect: true,
      serverURL: 'https://some.api.com',
      index: {
        users: ['name'],
      },
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
        } as InstantSyncResponse);
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
        } as InstantSyncResponse);
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
        } as InstantSyncResponse);
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
      syncHistory.push(syncing);
    });
    await insta.db.table('_sync').add({
      collection: 'users',
      activity: 'oldest',
      status: 'incomplete',
      synced: new Date().toISOString(),
      count: 50000,
    });
    // Add a delay to allow time for the observable to emit
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
      count: 0,
    });
    // Add a delay to allow time for the observable to emit
    await delay(100);
    expect(syncHistory).toEqual([false, false]);
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
        get: () => originalNavigatorOnLine,
        configurable: true,
      });
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
        serverURL: 'https://some.api.com',
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
        serverURL: 'https://some.api.com',
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
        serverURL: 'https://some.api.com',
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
        serverURL: 'https://some.api.com',
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
        serverURL: 'https://some.api.com',
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
    });

    afterEach(() => {
      isServerSpy.mockRestore();
      intervalSpy.mockRestore();
      allSettledSpy.mockRestore();
      jest.restoreAllMocks();
    });

    test('should schedule tasks when isServer is true', async () => {
      const insta2 = new Instant({
        schema,
        name: 'InstantTest2',
        serverURL: 'https://some.api.com',
      });

      await insta2.ready();

      expect(isServerSpy).toHaveBeenCalled();
      expect(intervalSpy).toHaveBeenCalledWith(1000);

      intervalSubject.next(0);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(allSettledSpy).toHaveBeenCalled();
      expect(allSettledSpy).toHaveBeenCalledWith([
        expect.any(Promise),
        expect.any(Promise),
      ]);
    });
  });

  describe('Batch Sync Scheduler', () => {
    let isServerSpy: jest.SpyInstance;

    beforeEach(() => {
      isServerSpy = jest.spyOn(utils, 'isServer').mockReturnValue(true);
    });

    afterEach(() => {
      isServerSpy.mockRestore();
      jest.restoreAllMocks();
    });

    test('run batch worker through sync scheduler', async () => {
      jest.useFakeTimers();
      const insta2 = new Instant({
        schema,
        name: 'InstantTest2',
        serverURL: 'https://some.api.com',
        buffer: 100,
      });

      const runBatchWorkerSpy = jest
        .spyOn(insta2, 'runBatchWorker')
        .mockResolvedValue({} as any);

      await insta2.ready();

      insta2.addBatch({
        collection: 'users',
        synced: new Date().toISOString(),
        activity: 'recent',
        token: 'some-token',
        headers: {},
        params: {},
      });

      tick(1000);

      expect(runBatchWorkerSpy).toHaveBeenCalled();

      runBatchWorkerSpy.mockClear();
    });
  });
});
