import {
  Elysia,
  ElysiaConfig,
} from 'elysia';

import {
  BordaError,
  ErrorCode,
  isEmpty,
  query,
  Session,
} from '@borda/sdk';
import {
  Cache,
  getCloudFunction,
} from '@borda/server';

import { BordaHeaders } from './internal';

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
}: // query
{
  name?: string;
  config?: Partial<ElysiaConfig>;
  serverHeaderPrefix: string;
  serverKey: string;
  serverSecret: string;
  poweredBy: string;
  // query:BordaQuery
}) {
  const server = new Elysia(config);

  server.use(addPowered({ server, by: poweredBy }));
  server.use(ensureApiKey({ server, serverKey, serverHeaderPrefix }));
  server.use(routeUnlock({ server, serverSecret, serverHeaderPrefix }));
  server.use(queryInspect({ server, serverHeaderPrefix }));
  server.use(pingRoute({ server }));

  // for fun
  server.all('/hello/*', ({ path }) => {
    return `Hello Borda from ${path}`;
  });

  // handle collection post
  server.post(
    '/:collectionName',
    async ({
      path,
      params,
      body,
      request,
    }: {
      path: string;
      params: any;
      body: any;
      request: any;
    }) => {
      const { collectionName } = params;
      const { unlocked } = request;

      console.log('unlocked', unlocked);
      console.log('collectionName', collectionName);
      // @todo use the new Borda rest api
      return [
        {
          collectionName,
          body,
          unlocked,
        },
      ];
    },
    {
      async beforeHandle({
        set,
        path,
        request,
        params,
      }: {
        set: any;
        path: string;
        request: any;
        params: any;
      }) {
        return;
        const { collectionName } = params;

        let isPublicCloudFunction = false;
        let session: Session | null = null;
        let memo: Session | void;

        const token = request.headers.get(
          `${serverHeaderPrefix}-${BordaHeaders['apiToken']}`
        );
        const method =
          request.headers.get(
            `${serverHeaderPrefix}-${BordaHeaders['apiMethod']}`
          ) ?? '';

        const isUserSpecialRoutes =
          collectionName === 'User' &&
          ['signUp', 'signIn', 'passwordForgot', 'passwordReset'].includes(
            method
          );

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
          memo = Cache.get('Session', token);
          if (memo) {
            request.session = memo;
            session = memo;
          } else {
            // @todo use the new Borda server-only query
            session = await query<Session>('Session')
              .unlock()
              .include(['user'])
              .filter({
                token: {
                  $eq: token,
                },
                expiresAt: {
                  $gt: new Date().toISOString(),
                },
              })
              .findOne();
            console.log(session);
            if (!isEmpty(session)) {
              // cache the session itself
              Cache.set('Session', session.token, session);
              // cache a reference to the session token which belongs to the user
              Cache.set('Session$token', session.user.objectId, {
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
          return new BordaError(
            ErrorCode.UNAUTHORIZED,
            'Unauthorized'
          ).toString();
        }

        return;
      },
    }
  );

  return server;
}
