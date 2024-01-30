// import './preload';

import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { Borda } from '../src/lib/Borda';

jest.mock('../src/lib/rest', () => ({
  createServer: jest.fn().mockReturnValue(true),
}));

jest.mock('mongodb');

let mongoServer: any;

describe('Borda', () => {
  let borda: Borda;
  beforeAll(async () => {
    mongoServer = new MongoMemoryServer();
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
  });

  afterAll(async () => {
    await mongoServer.stop();
  });

  beforeEach(() => {
    borda = new Borda();
  });

  it('should have default params', () => {
    expect(borda.name).toEqual('default');
    expect(borda.inspect).toEqual(false);
    expect(borda.mongoURI).toEqual('mongodb://127.0.0.1:27017/borda-dev');
    expect(borda.serverKey).toEqual('b-o-r-d-a');
    expect(borda.serverSecret).toEqual('s-e-c-r-e-t');
    expect(borda.serverURL).toEqual('http://127.0.0.1:1337');
    expect(borda.serverHeaderPrefix).toEqual('X-Borda');
    expect(borda.serverPoweredBy).toEqual('Borda');
    expect(borda.cacheTTL).toEqual(1 * 1000 * 60 * 60);
    expect(borda.queryLimit).toEqual(50);
  });
  it('should have a custom config', () => {
    borda = new Borda({
      params: {
        name: 'server-01',
        inspect: true,
        mongoURI: 'mongodb://127.0.0.1:27017/borda-ci',
        serverKey: 'key',
        serverSecret: 'secret',
        serverURL: 'http://',
        serverHeaderPrefix: 'prefix',
        serverPoweredBy: 'powered',
        cacheTTL: 1000,
        queryLimit: 10,
      },
    });

    expect(borda.name).toEqual('server-01');
    expect(borda.inspect).toEqual(true);
    expect(borda.mongoURI).toEqual('mongodb://127.0.0.1:27017/borda-ci');
    expect(borda.serverKey).toEqual('key');
    expect(borda.serverSecret).toEqual('secret');
    expect(borda.serverURL).toEqual('http://');
    expect(borda.serverHeaderPrefix).toEqual('prefix');
    expect(borda.serverPoweredBy).toEqual('powered');
    expect(borda.cacheTTL).toEqual(1000);
    expect(borda.queryLimit).toEqual(10);
  });

  //   it('should have an elysia server', async () => {
  //     const server = await borda.server();
  //     expect(server).toBeDefined();
  //     expect(server).toBeInstanceOf(Elysia);
  //   });

  it('should throw if db cannot connect', async () => {
    (MongoClient as jest.MockedClass<typeof MongoClient>).mockImplementation(
      (url, options) =>
        ({
          connect: jest.fn().mockRejectedValue(new Error('some-error')),
        } as any)
    );

    // Wrap the constructor call in an async function
    const borda = new Borda({
      params: {
        mongoURI: 'mongodb://',
      },
    });

    await expect(borda.server()).rejects.toThrow('some-error');
  });
});
