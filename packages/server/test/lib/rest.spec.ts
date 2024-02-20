import { Elysia } from 'elysia';

import { Borda } from '@borda/server';

import * as rest from '../../src/lib/rest';
import { mockMongoServerWith } from '../preload';

let bordaServer: Elysia | null;
let mongoServer: any;

jest.mock('mongodb');

describe('Borda Rest', () => {
  beforeAll(async () => {
    mongoServer = mockMongoServerWith();
  });

  afterAll(async () => {
    await mongoServer.stop();
  });

  beforeEach(async () => {
    const borda = new Borda();
    bordaServer = await borda.server();
  });

  it('should have Borda Server defined', async () => {
    expect(bordaServer).toBeDefined();
  });

  it('should add powered by header', () => {
    // Create a mock server with a mock onAfterHandle method
    const mockServer = {
      onAfterHandle: jest.fn(),
    };
    // Call the addPowered method with the mock server
    rest.addPowered({ server: mockServer as unknown as Elysia, by: 'Test' });
    // Check if the onAfterHandle method was called with a function
    expect(mockServer.onAfterHandle).toHaveBeenCalledWith(expect.any(Function));
    // Call the function passed to onAfterHandle with a mock set object
    const mockSet: any = { headers: {} };
    mockServer.onAfterHandle.mock.calls[0][0]({ set: mockSet });
    // Check if the X-Powered-By header was set correctly
    expect(mockSet.headers['X-Powered-By']).toBe('Test');
  });

  it('should validate API key', () => {
    // Create a mock server with a mock onRequest method
    const mockServer = {
      onRequest: jest.fn(),
    };

    // Call the ensureApiKey method with the mock server
    rest.ensureApiKey({
      server: mockServer as unknown as Elysia,
      serverKey: 'TestKey',
      serverHeaderPrefix: 'TestPrefix',
    });

    // Check if the onRequest method was called with a function
    expect(mockServer.onRequest).toHaveBeenCalledWith(expect.any(Function));

    // Call the function passed to onRequest with a mock set and request object
    const mockSet = { status: 200 };
    const mockRequest = {
      headers: { get: jest.fn().mockReturnValue('TestKey') },
    };
    mockServer.onRequest.mock.calls[0][0]({
      set: mockSet,
      request: mockRequest,
    });

    // Check if the status was not changed
    expect(mockSet.status).toBe(200);

    // Change the mock request to return a different key
    mockRequest.headers.get = jest.fn().mockReturnValue('WrongKey');
    mockServer.onRequest.mock.calls[0][0]({
      set: mockSet,
      request: mockRequest,
    });

    // Check if the status was changed to 401
    expect(mockSet.status).toBe(401);

    // check for status 400
    mockRequest.headers.get = jest.fn().mockReturnValue(null);
    mockServer.onRequest.mock.calls[0][0]({
      set: mockSet,
      request: mockRequest,
    });
    expect(mockSet.status).toBe(400);
  });

  it('should unlock the route with a server secret', () => {
    // Create a mock server with a mock onRequest method
    const mockServer = {
      onRequest: jest.fn(),
    };

    // Call the routeUnlock method with the mock server
    rest.routeUnlock({
      server: mockServer as unknown as Elysia,
      serverSecret: 'TestSecret',
      serverHeaderPrefix: 'TestPrefix',
    });

    // Check if the onRequest method was called with a function
    expect(mockServer.onRequest).toHaveBeenCalledWith(expect.any(Function));

    // Call the function passed to onRequest with a mock request object
    const mockRequest = {
      headers: { get: jest.fn().mockReturnValue('TestSecret') },
      unlocked: false,
    };
    mockServer.onRequest.mock.calls[0][0]({ request: mockRequest });

    // Check if the request was unlocked
    expect(mockRequest.unlocked).toBe(true);

    // Change the mock request to return a different secret
    mockRequest.headers.get = jest.fn().mockReturnValue('WrongSecret');
    mockRequest.unlocked = false; // reset unlocked
    mockServer.onRequest.mock.calls[0][0]({ request: mockRequest });

    // Check if the request was not unlocked
    expect(mockRequest.unlocked).not.toBe(true);
  });

  it('should add a param to inspect queries', () => {
    // Create a mock server with a mock onRequest method
    const mockServer = {
      onRequest: jest.fn(),
    };

    // Call the method with the mock server
    rest.queryInspect({
      server: mockServer as unknown as Elysia,
      serverHeaderPrefix: 'TestPrefix',
    });

    // Check if the onRequest method was called with a function
    expect(mockServer.onRequest).toHaveBeenCalledWith(expect.any(Function));

    // Call the function passed to onRequest with a mock request object
    const mockRequest = {
      headers: { get: jest.fn().mockReturnValue('true') },
      inspect: false,
    };
    mockServer.onRequest.mock.calls[0][0]({ request: mockRequest });

    // Check if the request was changed
    expect(mockRequest.inspect).toBe(true);

    // Change the mock request to return a different value
    mockRequest.headers.get = jest.fn().mockReturnValue(true);
    mockRequest.inspect = false; // reset
    mockServer.onRequest.mock.calls[0][0]({ request: mockRequest });

    // Check if the request was changed
    expect(mockRequest.inspect).toBe(true);

    // Change the mock request to return a different value
    mockRequest.headers.get = jest.fn().mockReturnValue('false');
    mockRequest.inspect = false; // reset
    mockServer.onRequest.mock.calls[0][0]({ request: mockRequest });

    // Check if the request was not changed
    expect(mockRequest.inspect).not.toBe(true);
  });

  it('should have a /ping route', () => {
    // Create a mock server with a mock get method
    const mockServer = {
      get: jest.fn(),
    };

    // Call the pingRoute method with the mock server
    rest.pingRoute({ server: mockServer as unknown as Elysia });

    // Check if the get method was called with '/ping' and a function
    expect(mockServer.get).toHaveBeenCalledWith('/ping', expect.any(Function));

    // Call the function passed to get
    const result = mockServer.get.mock.calls[0][1]();

    // Check the return
    expect(result).toBe('🏓');
  });
});
