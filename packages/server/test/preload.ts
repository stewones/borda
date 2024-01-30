import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';

export function mockMongoServerWith() {
  const mongoServer = new MongoMemoryServer();
  (MongoClient as jest.MockedClass<typeof MongoClient>).mockImplementation(
    (url, options) =>
      ({
        connect: jest.fn().mockResolvedValue(true),
        db: jest.fn().mockReturnValue({
          collection: jest.fn().mockReturnValue({
            insertOne: jest.fn().mockResolvedValue({ insertedId: 'some-id' }),
            createIndex: jest.fn().mockResolvedValue(true),
          }),
          listCollections: jest.fn().mockReturnValue({
            toArray: jest
              .fn()
              .mockResolvedValue([
                { type: 'collection', name: 'some-collection' },
              ]),
          }),
        }),
      } as any)
  );

  return mongoServer;
}
