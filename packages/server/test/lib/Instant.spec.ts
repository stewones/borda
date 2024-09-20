import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { z } from 'zod';

import { schema as commonSchema } from '@/common';

import { createObjectId } from '../../src';
import { Instant } from '../../src/lib/Instant';

const schema = {
  ...commonSchema,
  users: commonSchema.users.extend({
    posts: z.array(commonSchema.posts).optional(),
  }),
};

describe('Instant Server', () => {
  let insta: Instant<typeof schema>;
  let mongoServer: MongoMemoryServer;
  let mongoClient: MongoClient;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    mongoClient = await MongoClient.connect(mongoUri);
    const db = mongoClient.db('instant-mongodb');

    insta = new Instant({
      db,
      schema,
      inspect: true,
    });
  });

  afterAll(async () => {
    await mongoClient.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await insta.db.collection('users').deleteMany({});
    await insta.db.collection('posts').deleteMany({});
    await insta.db.collection('comments').deleteMany({});
  });

  test('should query users with limit and skip', async () => {
    // Arrange
    const users = [
      { _id: createObjectId(), name: 'Raul', email: 'raul@example.com' },
      { _id: createObjectId(), name: 'Elis', email: 'elis@example.com' },
      { _id: createObjectId(), name: 'Charlie', email: 'charlie@example.com' },
    ];

    await insta.db.collection('users').insertMany(users);

    // Act
    const result = await insta.query({
      users: {
        $limit: 2,
        $skip: 1,
      },
    });

    // Assert
    expect(result.users).toHaveLength(2);
    expect(result.users[0].name).toBe('Elis');
    expect(result.users[1].name).toBe('Charlie');
  });

  test('should query users with a filter', async () => {
    // Arrange
    const users = [
      { _id: createObjectId(), name: 'Raul', email: 'raul@example.com' },
      { _id: createObjectId(), name: 'Elis', email: 'elis@example.com' },
      { _id: createObjectId(), name: 'Charlie', email: 'charlie@example.com' },
    ];
    await insta.db.collection('users').insertMany(users);

    // Act
    const result = await insta.query({
      users: {
        $filter: {
          name: { $in: ['Elis', 'Charlie'] },
        },
      },
    });

    // Assert
    expect(result.users).toHaveLength(2);
    expect(result.users.map((u) => u.name)).toEqual(['Elis', 'Charlie']);
  });

  test('should query users with sort', async () => {
    // Arrange
    const users = [
      { _id: createObjectId(), name: 'Raul', email: 'raul@example.com' },
      { _id: createObjectId(), name: 'Elis', email: 'elis@example.com' },
      { _id: createObjectId(), name: 'Charlie', email: 'charlie@example.com' },
    ];
    await insta.db.collection('users').insertMany(users);

    // Act
    const result = await insta.query({
      users: {
        $sort: { name: -1 },
      },
    });

    // Assert
    expect(result.users).toHaveLength(3);
    expect(result.users.map((u) => u.name)).toEqual([
      'Raul',
      'Elis',
      'Charlie',
    ]);
  });

  test('should query nested posts for users', async () => {
    // Arrange
    const users = [
      { _id: createObjectId(), name: 'Raul', email: 'raul@example.com' },
      { _id: createObjectId(), name: 'Elis', email: 'elis@example.com' },
    ];

    await insta.db.collection('users').insertMany(users);

    const createdUsers = await insta.db.collection('users').find({}).toArray();

    const posts = [
      {
        _id: createObjectId(),
        title: 'Post 1',
        content: 'Content 1',
        _p_user: `users$${createdUsers[0]._id}`,
      },
      {
        _id: createObjectId(),
        title: 'Post 2',
        content: 'Content 2',
        _p_user: `users$${createdUsers[0]._id}`,
      },
      {
        _id: createObjectId(),
        title: 'Post 3',
        content: 'Content 3',
        _p_user: `users$${createdUsers[1]._id}`,
      },
    ];

    await insta.db.collection('posts').insertMany(posts);

    // const createdPosts = await insta.db.collection('posts').find({}).toArray();
    // console.log(JSON.stringify(createdUsers, null, 2));
    // console.log(JSON.stringify(createdPosts, null, 2));

    // Act
    const result = await insta.query({
      users: {
        posts: {
          $limit: 1,
        },
      },
    });

    // Assert
    expect(result.users).toHaveLength(2);
    expect(result.users[0].posts).toHaveLength(1);
    expect(result.users[1].posts).toHaveLength(1);
    expect(result.users[0].posts?.[0].title).toBe('Post 1');
    expect(result.users[1].posts?.[0].title).toBe('Post 3');
  });

  fit('should include data via pointers', async () => {
    // Arrange
    const users = [
      { _id: createObjectId(), name: 'Raul', email: 'raul@example.com' },
      { _id: createObjectId(), name: 'Elis', email: 'elis@example.com' },
    ];

    await insta.db.collection('users').insertMany(users);

    const createdUsers = await insta.db.collection('users').find({}).toArray();

    const posts = [
      {
        _id: createObjectId(),
        title: 'Post 1',
        content: 'Content 1',
        _p_user: `users$${createdUsers[0]._id}`,
      },
      {
        _id: createObjectId(),
        title: 'Post 2',
        content: 'Content 2',
        _p_user: `users$${createdUsers[0]._id}`,
      },
      {
        _id: createObjectId(),
        title: 'Post 3',
        content: 'Content 3',
        _p_user: `users$${createdUsers[1]._id}`,
      },
    ];

    await insta.db.collection('posts').insertMany(posts);

    // Act
    const result = await insta.query({
      posts: {
        $include: ['user'],
      },
    });

    // Assert
    // console.log(JSON.stringify(result, null, 2));
    expect(result.posts).toHaveLength(3);
    expect(result.posts[0].user?.name).toBe('Raul');
    expect(result.posts[1].user?.name).toBe('Raul');
    expect(result.posts[2].user?.name).toBe('Elis');
  });
});
