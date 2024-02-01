/* eslint-disable @typescript-eslint/no-explicit-any */
import { Elysia, ElysiaConfig } from 'elysia';
import { Db } from 'mongodb';

import { BordaError, ErrorCode, isEmpty, Session } from '@borda/sdk';
import { getCloudFunction } from '@borda/server';

import { BordaQuery } from './Borda';
import { Cache } from './Cache';
import { BordaHeaders } from './internal';
import { restGet, restPost, restPut } from './rest';

export const addPowered = ({ server, by }: { server: Elysia; by: string }) =>
  server.onAfterHandle(({ set }) => {
    set.headers['X-Powered-By'] = by;
  });

export const ensureApiKey = ({
  server,
  serverKey,
  serverHeaderPrefix,
}: {
  server: Elysia;
  serverKey: string;
  serverHeaderPrefix: string;
}) =>
  server.onRequest(({ set, request }) => {
    const apiKeyHeaderKey = `${serverHeaderPrefix}-${BordaHeaders['apiKey']}`;
    const apiKey = request.headers.get(apiKeyHeaderKey?.toLowerCase());

    if (!apiKey) {
      set.status = 400;
      return 'API key required';
    }

    if (apiKey !== serverKey) {
      set.status = 401;
      return 'Unauthorized API key';
    }

    return;
  });

export async function ensureApiSession({
  set,
  path,
  request,
  cache,
  query,
  serverHeaderPrefix,
  collectionName,
}: {
  set: any;
  path: string;
  request: Request & any;
  cache: Cache;
  query: (collection: string) => BordaQuery;
  serverHeaderPrefix: string;
  collectionName: string;
}) {
  let isPublicCloudFunction = false;
  let session: Session | null = null;
  let memo: Session | void;

  const token = request.headers.get(
    `${serverHeaderPrefix}-${BordaHeaders['apiToken']}`
  );
  const method =
    request.headers.get(`${serverHeaderPrefix}-${BordaHeaders['apiMethod']}`) ??
    '';

  const isUserSpecialRoutes =
    collectionName === 'User' &&
    ['signUp', 'signIn', 'passwordForgot', 'passwordReset'].includes(method);

  const isSpecialRoutes = isUserSpecialRoutes;
  const isLocked = !request.unlocked;

  if (path.startsWith('/run')) {
    // extract function name from `/run/:functionName`
    const functionName = path.split('/').pop() ?? '';
    const cloudFunction = getCloudFunction(functionName); // @todo move getCloudFunction Borda
    if (cloudFunction && cloudFunction.isPublic) {
      isPublicCloudFunction = true;
    }
  }

  if (token) {
    memo = cache.get('Session', token);
    if (memo) {
      request.session = memo;
      session = memo;
    } else {
      session = (await query('Session')
        .include(['user'])
        .filter({
          token: {
            $eq: token,
          },
          expiresAt: {
            $gt: new Date().toISOString(),
          },
        })
        .findOne()) as Session;

      if (!isEmpty(session)) {
        // cache the session itself
        cache.set('Session', session.token, session);
        // cache a reference to the session token which belongs to the user
        cache.set('Session$token', session.user.objectId, {
          token: session.token,
        });
        request.session = session;
      }
    }
  }

  if (
    isEmpty(session) &&
    isLocked &&
    !isSpecialRoutes &&
    !isPublicCloudFunction
  ) {
    set.status = 401;
    return new BordaError(ErrorCode.UNAUTHORIZED, 'Unauthorized').toString();
  }

  return;
}

export const routeUnlock = ({
  server,
  serverSecret,
  serverHeaderPrefix,
}: {
  server: Elysia;
  serverSecret: string;
  serverHeaderPrefix: string;
}) =>
  server.onRequest(({ request }: { request: any }) => {
    const apiSecret = request.headers.get(
      `${serverHeaderPrefix}-${BordaHeaders['apiSecret']}`
    );
    if (apiSecret === serverSecret) {
      request.unlocked = true;
    }
    return;
  });

export const pingRoute = ({ server }: { server: Elysia }) =>
  server.get('/ping', () => '🏓');

export const queryInspect = ({
  server,
  serverHeaderPrefix,
}: {
  server: Elysia;
  serverHeaderPrefix: string;
}) =>
  server.onRequest(({ request }: { request: any }) => {
    const apiInspect = request.headers.get(
      `${serverHeaderPrefix}-${BordaHeaders['apiInspect']}`
    );
    // parse boolean
    const inspect = apiInspect === 'true' || apiInspect === true;
    if (inspect) {
      request.inspect = true;
    }
    return;
  });

export function createServer({
  config,
  serverHeaderPrefix,
  serverKey,
  serverSecret,
  poweredBy,
  query,
  cache,
  db,
}: {
  name?: string;
  config?: Partial<ElysiaConfig>;
  serverHeaderPrefix: string;
  serverKey: string;
  serverSecret: string;
  poweredBy: string;
  query: (collection: string) => BordaQuery;
  cache: Cache;
  db: Db;
}) {
  const server = new Elysia(config);
  const q = query;
  server.use(addPowered({ server, by: poweredBy }));
  server.use(ensureApiKey({ server, serverKey, serverHeaderPrefix }));
  server.use(routeUnlock({ server, serverSecret, serverHeaderPrefix }));
  server.use(queryInspect({ server, serverHeaderPrefix }));
  server.use(pingRoute({ server }));

  /**
   * handle rest routes
   */
  server.post(
    '/:collectionName',
    async ({
      params,
      request,
      body,
    }: {
      params: any;
      request: Request & any;
      body: any;
    }) =>
      restPost({
        params,
        request,
        body,
        db,
        query,
        cache,
        serverHeaderPrefix,
      }),
    {
      async beforeHandle({
        set,
        path,
        request,
        params,
      }: {
        set: any;
        path: string;
        request: Request & any;
        params: any;
      }) {
        const { collectionName } = params;
        return ensureApiSession({
          set,
          path,
          request,
          cache,
          query,
          collectionName,
          serverHeaderPrefix,
        });
      },
    }
  );

  server.put(
    '/:collectionName/:objectId',
    async ({
      params,
      request,
      body,
    }: {
      params: any;
      request: Request & any;
      body: any;
    }) =>
      restPut({
        params,
        request,
        body,
        db,
        cache,
      }),
    {
      async beforeHandle({
        set,
        path,
        request,
        params,
      }: {
        set: any;
        path: string;
        request: Request & any;
        params: any;
      }) {
        const { collectionName } = params;
        return ensureApiSession({
          set,
          path,
          request,
          cache,
          query,
          collectionName,
          serverHeaderPrefix,
        });
      },
    }
  );

  server.get(
    '/:collectionName/:objectId',
    async ({
      params,
      request,
      query,
    }: {
      params: any;
      request: Request & any;
      query: any;
    }) =>
      restGet({
        params,
        request,
        db,
        query,
        cache,
        q,
      }),
    {
      transform({ query }: { query: any }) {
        // transform include and exclude to array
        if (query['include']) {
          query['include'] = query['include'].split(',');
        }
        if (query['exclude']) {
          query['exclude'] = query['exclude'].split(',');
        }
      },
      async beforeHandle({
        set,
        path,
        request,
        params,
      }: {
        set: any;
        path: string;
        request: Request & any;
        params: any;
      }) {
        const { collectionName } = params;
        return ensureApiSession({
          set,
          path,
          request,
          cache,
          query,
          collectionName,
          serverHeaderPrefix,
        });
      },
    }
  );

  return server;
}
