import {
  MongoClient,
  ReadConcernLevel,
} from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { z } from 'zod';

import { createPointer } from '@borda/client';

import { PostSchema, schema as commonSchema, UserSchema } from '@/common';

import { createObjectId } from '../../src';
import { Instant } from '../../src/lib/Instant';

const schema = {
  ...commonSchema,
  users: UserSchema.extend({
    posts: z.array(PostSchema).optional(),
  }),
  posts: PostSchema.extend({
    user: UserSchema.optional(),
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

  describe('query', () => {
    beforeEach(async () => {
      await insta.db.collection('users').deleteMany({});
      await insta.db.collection('posts').deleteMany({});
      await insta.db.collection('comments').deleteMany({});
    });

    test('query with $limit and $skip', async () => {
      // Arrange
      const users = [
        { _id: createObjectId(), name: 'Raul', email: 'raul@example.com' },
        { _id: createObjectId(), name: 'Elis', email: 'elis@example.com' },
        {
          _id: createObjectId(),
          name: 'Charlie',
          email: 'charlie@example.com',
        },
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

    test('query with a $filter', async () => {
      // Arrange
      const users = [
        { _id: createObjectId(), name: 'Raul', email: 'raul@example.com' },
        { _id: createObjectId(), name: 'Elis', email: 'elis@example.com' },
        {
          _id: createObjectId(),
          name: 'Charlie',
          email: 'charlie@example.com',
        },
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

    test('$sort', async () => {
      // Arrange
      const users = [
        { _id: createObjectId(), name: 'Raul', email: 'raul@example.com' },
        { _id: createObjectId(), name: 'Elis', email: 'elis@example.com' },
        {
          _id: createObjectId(),
          name: 'Charlie',
          email: 'charlie@example.com',
        },
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

    test('$limit query via nested groups', async () => {
      // Arrange
      const users = [
        { _id: createObjectId(), name: 'Raul', email: 'raul@example.com' },
        { _id: createObjectId(), name: 'Elis', email: 'elis@example.com' },
      ];

      const posts = [
        {
          _id: createObjectId(),
          title: 'Post 1',
          content: 'Content 1',
          _p_user: `users$${users[0]._id}`,
        },
        {
          _id: createObjectId(),
          title: 'Post 2',
          content: 'Content 2',
          _p_user: `users$${users[0]._id}`,
        },
        {
          _id: createObjectId(),
          title: 'Post 3',
          content: 'Content 3',
          _p_user: `users$${users[1]._id}`,
        },
      ];

      await insta.db.collection('users').insertMany(users);
      await insta.db.collection('posts').insertMany(posts);

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

    test('$include data via pointers', async () => {
      // Arrange
      const users = [
        { _id: createObjectId(), name: 'Raul', email: 'raul@example.com' },
        { _id: createObjectId(), name: 'Elis', email: 'elis@example.com' },
      ];

      await insta.db.collection('users').insertMany(users);

      const posts = [
        {
          _id: createObjectId(),
          title: 'Post 1',
          content: 'Content 1',
          _p_user: createPointer('users', users[0]._id.toString()),
        },
        {
          _id: createObjectId(),
          title: 'Post 2',
          content: 'Content 2',
          _p_user: createPointer('users', users[0]._id.toString()),
        },
        {
          _id: createObjectId(),
          title: 'Post 3',
          content: 'Content 3',
          _p_user: createPointer('users', users[1]._id.toString()),
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

    test('$include nested data via pointers', async () => {
      // Arrange
      const orgs = [
        { _id: createObjectId(), name: 'Org 1', email: 'org1@example.com' },
        { _id: createObjectId(), name: 'Org 2', email: 'org2@example.com' },
      ];

      const users = [
        {
          _id: createObjectId(),
          name: 'Raul',
          email: 'raul@example.com',
          _p_org: createPointer('orgs', orgs[0]._id.toString()),
        },
        {
          _id: createObjectId(),
          name: 'Elis',
          email: 'elis@example.com',
          _p_org: createPointer('orgs', orgs[1]._id.toString()),
        },
      ];

      const posts = [
        {
          _id: createObjectId(),
          title: 'Post 1',
          content: 'Content 1',
          _p_user: createPointer('users', users[0]._id.toString()),
        },
        {
          _id: createObjectId(),
          title: 'Post 2',
          content: 'Content 2',
          _p_user: createPointer('users', users[0]._id.toString()),
        },
        {
          _id: createObjectId(),
          title: 'Post 3',
          content: 'Content 3',
          _p_user: createPointer('users', users[1]._id.toString()),
        },
      ];

      await insta.db.collection('orgs').insertMany(orgs);
      await insta.db.collection('users').insertMany(users);
      await insta.db.collection('posts').insertMany(posts);

      // Act
      const result = await insta.query({
        posts: {
          $include: ['user.org'],
        },
      });

      // Assert
      // console.log(JSON.stringify(result, null, 2));
      expect(result.posts).toHaveLength(3);
      expect(result.posts[0].user?.name).toBe('Raul');
      expect(result.posts[1].user?.name).toBe('Raul');
      expect(result.posts[2].user?.name).toBe('Elis');
      expect(result.posts[0].user?.org?.name).toBe('Org 1');
      expect(result.posts[1].user?.org?.name).toBe('Org 1');
      expect(result.posts[2].user?.org?.name).toBe('Org 2');
    });

    test('$include nested data via nested groups', async () => {
      // Arrange
      const orgs = [
        { _id: createObjectId(), name: 'Org 1', email: 'org1@example.com' },
        { _id: createObjectId(), name: 'Org 2', email: 'org2@example.com' },
      ];

      const users = [
        {
          _id: createObjectId(),
          name: 'Raul',
          email: 'raul@example.com',
          _p_org: createPointer('orgs', orgs[0]._id.toString()),
        },
        {
          _id: createObjectId(),
          name: 'Elis',
          email: 'elis@example.com',
          _p_org: createPointer('orgs', orgs[1]._id.toString()),
        },
      ];

      const posts = [
        {
          _id: createObjectId(),
          title: 'Post 1',
          content: 'Content 1',
          _p_user: createPointer('users', users[0]._id.toString()),
          _p_org: createPointer('orgs', orgs[0]._id.toString()),
        },
        {
          _id: createObjectId(),
          title: 'Post 2',
          content: 'Content 2',
          _p_user: createPointer('users', users[0]._id.toString()),
          _p_org: createPointer('orgs', orgs[0]._id.toString()),
        },
        {
          _id: createObjectId(),
          title: 'Post 3',
          content: 'Content 3',
          _p_user: createPointer('users', users[1]._id.toString()),
          _p_org: createPointer('orgs', orgs[1]._id.toString()),
        },
      ];

      await insta.db.collection('orgs').insertMany(orgs);
      await insta.db.collection('users').insertMany(users);
      await insta.db.collection('posts').insertMany(posts);

      // Act
      const result = await insta.query({
        users: {
          $include: ['org'],
          posts: {
            $include: ['org', 'user.org'],
          },
        },
      });

      // Assert
      expect(result.users).toHaveLength(2);
      expect(result.users[0].posts?.length).toBe(2);
      expect(result.users[0].org?.name).toBe('Org 1');
      expect(result.users[0].posts?.[0]?.org?.name).toBe('Org 1');
      expect(result.users[0].posts?.[0]?.user?.name).toBe('Raul');
      expect(result.users[0].posts?.[1]?.org?.name).toBe('Org 1');
      expect(result.users[0].posts?.[1]?.user?.name).toBe('Raul');

      expect(result.users[1].posts?.length).toBe(1);
      expect(result.users[1].org?.name).toBe('Org 2');
      expect(result.users[1].posts?.[0]?.org?.name).toBe('Org 2');
      expect(result.users[1].posts?.[0]?.user?.name).toBe('Elis');
    });

    test('$include nested data via nested groups in parallel', async () => {
      // Arrange
      const orgs = [
        { _id: createObjectId(), name: 'Org 1', email: 'org1@example.com' },
        { _id: createObjectId(), name: 'Org 2', email: 'org2@example.com' },
      ];

      const users = [
        {
          _id: createObjectId(),
          name: 'Raul',
          email: 'raul@example.com',
          _p_org: createPointer('orgs', orgs[0]._id.toString()),
        },
        {
          _id: createObjectId(),
          name: 'Elis',
          email: 'elis@example.com',
          _p_org: createPointer('orgs', orgs[1]._id.toString()),
        },
      ];

      const posts = [
        {
          _id: createObjectId(),
          title: 'Post 1',
          content: 'Content 1',
          _p_user: createPointer('users', users[0]._id.toString()),
          _p_org: createPointer('orgs', orgs[0]._id.toString()),
        },
        {
          _id: createObjectId(),
          title: 'Post 2',
          content: 'Content 2',
          _p_user: createPointer('users', users[0]._id.toString()),
          _p_org: createPointer('orgs', orgs[0]._id.toString()),
        },
        {
          _id: createObjectId(),
          title: 'Post 3',
          content: 'Content 3',
          _p_user: createPointer('users', users[1]._id.toString()),
          _p_org: createPointer('orgs', orgs[1]._id.toString()),
        },
      ];

      await insta.db.collection('orgs').insertMany(orgs);
      await insta.db.collection('users').insertMany(users);
      await insta.db.collection('posts').insertMany(posts);

      // Act
      const result = await insta.query({
        orgs: {},
        users: {
          $include: ['org'],
          posts: {
            $include: ['org', 'user.org'],
          },
        },
        posts: {
          $include: ['user.org'],
        },
      });

      // Assert
      console.log(JSON.stringify(result, null, 2));
    });

    test('$aggregate with $options', async () => {
      // Arrange
      const orgs = [
        { _id: createObjectId(), name: 'Org 1', email: 'org1@example.com' },
        { _id: createObjectId(), name: 'Org 2', email: 'org2@example.com' },
      ];

      const users = [
        {
          _id: createObjectId(),
          name: 'Raul',
          email: 'raul@example.com',
          _p_org: createPointer('orgs', orgs[0]._id.toString()),
        },
        {
          _id: createObjectId(),
          name: 'Elis',
          email: 'elis@example.com',
          _p_org: createPointer('orgs', orgs[1]._id.toString()),
        },
      ];

      const posts = [
        {
          _id: createObjectId(),
          title: 'Post 1',
          content: 'Content 1',
          _p_user: createPointer('users', users[0]._id.toString()),
          _p_org: createPointer('orgs', orgs[0]._id.toString()),
        },
        {
          _id: createObjectId(),
          title: 'Post 2',
          content: 'Content 2',
          _p_user: createPointer('users', users[0]._id.toString()),
          _p_org: createPointer('orgs', orgs[0]._id.toString()),
        },
        {
          _id: createObjectId(),
          title: 'Post 3',
          content: 'Content 3',
          _p_user: createPointer('users', users[1]._id.toString()),
          _p_org: createPointer('orgs', orgs[1]._id.toString()),
        },
      ];

      await insta.db.collection('orgs').insertMany(orgs);
      await insta.db.collection('users').insertMany(users);
      await insta.db.collection('posts').insertMany(posts);

      // Act
      const result = await insta.query({
        users: {
          $aggregate: [
            {
              $match: {
                name: 'Raul',
              },
            },
            {
              $addFields: {
                orgId: { $substr: ['$_p_org', 5, -1] },
              },
            },
            {
              $lookup: {
                from: 'orgs',
                localField: 'orgId',
                foreignField: '_id',
                as: 'org',
              },
            },
            {
              $addFields: {
                org: { $first: '$org' },
              },
            },
            {
              $unset: ['orgId', '_p_org'],
            },
          ],
          $options: {
            allowDiskUse: true,
            maxTimeMS: 10000,
            readConcern: ReadConcernLevel.majority,
          },
        },
      });

      // Assert
      console.log(JSON.stringify(result, null, 2));
      expect(result.users).toHaveLength(1);
      expect(result.users[0].name).toBe('Raul');
      expect(result.users[0].org?.name).toBe('Org 1');
    });

    test('$aggregate with $include', async () => {
      // Arrange
      const orgs = [
        { _id: createObjectId(), name: 'Org 1', email: 'org1@example.com' },
        { _id: createObjectId(), name: 'Org 2', email: 'org2@example.com' },
      ];

      const users = [
        {
          _id: createObjectId(),
          name: 'Raul',
          email: 'raul@example.com',
          _p_org: createPointer('orgs', orgs[0]._id.toString()),
        },
        {
          _id: createObjectId(),
          name: 'Elis',
          email: 'elis@example.com',
          _p_org: createPointer('orgs', orgs[1]._id.toString()),
        },
      ];

      const posts = [
        {
          _id: createObjectId(),
          title: 'Post 1',
          content: 'Content 1',
          _p_user: createPointer('users', users[0]._id.toString()),
          _p_org: createPointer('orgs', orgs[0]._id.toString()),
        },
        {
          _id: createObjectId(),
          title: 'Post 2',
          content: 'Content 2',
          _p_user: createPointer('users', users[0]._id.toString()),
          _p_org: createPointer('orgs', orgs[0]._id.toString()),
        },
        {
          _id: createObjectId(),
          title: 'Post 3',
          content: 'Content 3',
          _p_user: createPointer('users', users[1]._id.toString()),
          _p_org: createPointer('orgs', orgs[1]._id.toString()),
        },
      ];

      await insta.db.collection('orgs').insertMany(orgs);
      await insta.db.collection('users').insertMany(users);
      await insta.db.collection('posts').insertMany(posts);

      // Act
      const result = await insta.query({
        users: {
          $aggregate: [
            {
              $match: {
                name: 'Elis',
              },
            },
          ],
          $include: ['org'],
        },
      });

      // Assert
      // console.log(JSON.stringify(result, null, 2));
      expect(result.users).toHaveLength(1);
      expect(result.users[0].name).toBe('Elis');
      expect(result.users[0].org?.name).toBe('Org 2');
    });
  });
});
