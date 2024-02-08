/* eslint-disable @typescript-eslint/no-explicit-any */
import { Elysia, ElysiaConfig } from 'elysia';
import { CollectionInfo, Db } from 'mongodb';

import {
  BordaError,
  DocumentLiveQuery,
  ErrorCode,
  InternalCollectionName,
  InternalHeaders,
  isEmpty,
  pointer,
  Session,
  User,
} from '@borda/client';

import { newToken } from '../utils';
import { BordaRequest } from './Borda';
import { Cache } from './Cache';
import { Cloud } from './Cloud';
import { handleOn, handleOnce } from './livequery';
import { PluginHook } from './plugin';
import { BordaServerQuery } from './query';
import {
  restCollectionDelete,
  restCollectionGet,
  restCollectionPost,
  restCollectionPut,
  restFunctionRun,
  restUserMe,
  restUserSignOut,
} from './rest';

export function createServer({
  config,
  serverHeaderPrefix,
  serverKey,
  serverSecret,
  serverURL,
  poweredBy,
  query,
  queryLimit,
  plugin,
  cache,
  db,
  collections,
  reservedCollections,
  liveCollections,
  cloud,
  inspect,
}: {
  name?: string;
  config?: Partial<ElysiaConfig>;
  serverHeaderPrefix: string;
  serverKey: string;
  serverSecret: string;
  serverURL: string;
  poweredBy: string;
  queryLimit: number;
  query: (collection: string) => BordaServerQuery;
  plugin: (name: PluginHook) => ((params?: any) => any) | undefined;
  cache: Cache;
  db: Db;
  collections: CollectionInfo[];
  reservedCollections: string[];
  liveCollections: string[];
  cloud: Cloud;
  inspect: boolean;
}) {
  const server = new Elysia(config);
  const q = query;

  server.use(addPowered({ server, by: poweredBy, collections }));
  server.use(
    ensureApiKey({ server, serverKey, serverHeaderPrefix, collections })
  );
  server.use(
    routeUnlock({ server, serverSecret, serverHeaderPrefix, collections })
  );
  server.use(queryInspect({ server, serverHeaderPrefix, collections }));
  server.use(pingRoute({ server }));

  // collection
  server.post(
    '/:collectionName',
    async ({
      params,
      request,
      body,
    }: {
      params: any;
      request: BordaRequest & any;
      body: any;
    }) =>
      restCollectionPost({
        params,
        request,
        body,
        db,
        query,
        queryLimit,
        plugin,
        cache,
        serverHeaderPrefix,
        serverURL,
        cloud,
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
        request: BordaRequest & any;
        params: any;
      }) {
        return ensureApiToken({
          set,
          path,
          request,
          cache,
          query,
          params,
          serverHeaderPrefix,
          cloud,
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
      request: BordaRequest & any;
      body: any;
    }) =>
      restCollectionPut({
        params,
        request,
        body,
        db,
        cache,
        cloud,
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
        request: BordaRequest & any;
        params: any;
      }) {
        return ensureApiToken({
          set,
          path,
          request,
          cache,
          query,
          params,
          serverHeaderPrefix,
          cloud,
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
      request: BordaRequest & any;
      query: any;
    }) =>
      restCollectionGet({
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
        request: BordaRequest & any;
        params: any;
      }) {
        return ensureApiToken({
          set,
          path,
          params,
          request,
          cache,
          query,
          serverHeaderPrefix,
          cloud,
        });
      },
    }
  );

  server.delete(
    '/:collectionName/:objectId',
    async ({
      params,
      request,
      body,
    }: {
      params: any;
      request: BordaRequest & any;
      body: any;
    }) =>
      restCollectionDelete({
        params,
        request,
        body,
        db,
        cache,
        cloud,
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
        request: BordaRequest & any;
        params: any;
      }) {
        return ensureApiToken({
          set,
          path,
          params,
          request,
          cache,
          query,
          serverHeaderPrefix,
          cloud,
        });
      },
    }
  );

  // me
  server.get(
    '/me',
    async ({ request }: { request: BordaRequest }) =>
      restUserMe({
        request,
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
        request: BordaRequest & any;
        params: any;
      }) {
        return ensureApiToken({
          set,
          path,
          params,
          request,
          cache,
          query,
          serverHeaderPrefix,
          cloud,
        });
      },
    }
  );

  server.delete(
    '/me',
    async ({ request }: { request: BordaRequest }) =>
      restUserSignOut({
        request,
        query,
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
        request: BordaRequest & any;
        params: any;
      }) {
        return ensureApiToken({
          set,
          path,
          params,
          request,
          cache,
          query,
          serverHeaderPrefix,
          cloud,
        });
      },
    }
  );

  // run
  server.post(
    '/run/:functionName',
    async ({ params, request }: { params: any; request: BordaRequest & any }) =>
      restFunctionRun({
        params,
        request,
        inspect,
        cloud,
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
        request: BordaRequest & any;
        params: any;
      }) {
        return ensureApiToken({
          set,
          path,
          request,
          cache,
          query,
          params,
          serverHeaderPrefix,
          cloud,
        });
      },
    }
  );

  // livequery
  server.ws('/live/:collectionName', {
    async beforeHandle({ set, headers, params }) {
      // extract websocket protocols from headers
      const protocols = headers['sec-websocket-protocol'];
      // 'apiKey#token#secret'

      // extract session token from protocols
      const protocolsArray = protocols ? protocols.split('#') : [];

      const apiKey = protocolsArray[0] && protocolsArray[0].trim();
      const token = protocolsArray[1] && protocolsArray[1].trim();
      const apiSecret = protocolsArray[2] && protocolsArray[2].trim();
      const hasToken = token && token !== 'null' && token !== 'undefined';
      if (inspect) {
        console.log('🔒LiveQuery', apiKey, token, apiSecret);
      }

      if (apiKey !== serverKey) {
        if (inspect) {
          console.log('⚡LiveQuery: Invalid API Key');
        }
        set.status = 1008;
        return 'Invalid key';
      }

      // check for secret
      if (apiSecret && apiSecret !== serverSecret) {
        set.status = 1008;
        if (inspect) {
          console.log('⚡LiveQuery: Invalid Secret');
        }
        return 'Invalid secret';
      }

      /**
       * validate session token (same as REST API)
       * we need to make sure the default is session token required
       *
       * server can unlock by passing a third param which is the server secret
       *
       * @todo
       * add the ability to bypass this option granually per request
       * in case of some public query in realtime
       *
       * so the SDK client would add "unlock" to the protocol then we allow the connection
       *
       * for security purposes users may want to implement beforeFind and beforeAggregate hooks
       * by themselves to make sure the query is safe
       */
      if (!apiSecret && !hasToken) {
        /**
         * throw an error log so we can know if someone is trying to connect to the live query server
         */
        set.status = 1008;
        if (inspect) {
          console.log('⚡LiveQuery: Invalid session');
        }
        return 'Invalid session';
      }

      if (hasToken) {
        // validate session token (add back `:` to the second char because we needed to strip it in the client)
        const tokenToValidate = `${token[0]}:${token.slice(1)}`;

        const memo = cache.get('Session', token);
        if (!memo) {
          const session = (await query('Session')
            .include(['user'])
            .filter({
              token: {
                $eq: tokenToValidate,
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
          } else {
            set.status = 1008;
            return 'Invalid session';
          }
        }
      }

      if (hasToken && apiSecret !== serverSecret) {
        // check for collection
        const collection =
          InternalCollectionName[params.collectionName] ||
          params.collectionName;

        /**
         * can't subscribe to any of the reserved collections
         */
        if (reservedCollections.includes(collection)) {
          const message = `You can't subscribe to the collection ${collection} because it's reserved`;
          if (inspect) {
            console.log(message);
          }
          set.status = 1008;
          return message;
        }

        /**
         * throw exception if the requested collection is not allowed
         */
        if (!liveCollections.includes(collection)) {
          if (inspect) {
            console.log('Collection not allowed');
          }
          set.status = 1008;
          return 'Collection not allowed';
        }
      }

      return; // all good
    },

    open(ws) {
      if (inspect) {
        console.log('Open Connection:', ws.id);
      }
    },
    close(ws) {
      if (inspect) {
        console.log('Closed Connection:', ws.id);
      }
    },
    async message(ws, message) {
      const liveQuery = message as DocumentLiveQuery;
      const { collection, event, method, ...rest } = liveQuery;

      if (method === 'on') {
        const { disconnect, onChanges, onError } = handleOn<any>({
          collection,
          event,
          method,
          ...rest,
          db,
          unlocked: true,
          cache,
          query,
          inspect,
        });

        onChanges.subscribe((data) => {
          ws.send(data);
        });
        onError.subscribe((error) => {
          if (inspect) {
            console.log('LiveQueryMessage error', error);
          }
          disconnect();
        });

        return;
      }

      const data = await handleOnce({
        collection,
        event,
        method,
        ...rest,
        db,
        unlocked: true,
        cache,
        query,
        inspect,
      });

      ws.send(data);
    },
  });

  /**
   * return the server to be extended by the consumer
   */
  return server;
}

export async function createSession({
  user,
  query,
}: {
  user: User;
  query: (collection: string) => BordaServerQuery;
}) {
  /**
   * because we don't want to expose the user password
   */
  delete user.password;

  /**
   * expires in 1 year
   * @todo make this an option ?
   */
  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  /**
   * generate a new session token
   */
  const token = `b:${newToken()}`;
  const session = await query('Session').insert({
    user: pointer('User', user.objectId),
    token,
    expiresAt: expiresAt.toISOString(),
  });

  return { ...session, user };
}

function requestTargetsBorda({
  request,
  collections,
}: {
  request: BordaRequest & any;
  collections: CollectionInfo[];
}) {
  // extract the path from request.url
  const path = new URL(request.url).pathname;
  const collectionRequested = path.split('/')[1];
  const collectionTargeted =
    InternalCollectionName[collectionRequested] || collectionRequested;

  const routesAvailable = ['ping', ...collections.map((c) => c.name)];

  if (!routesAvailable.includes(collectionTargeted)) {
    return false;
  }

  return true;
}

export const addPowered = ({
  server,
  by,
  collections,
}: {
  server: Elysia;
  by: string;
  collections: CollectionInfo[];
}) =>
  server.onAfterHandle(({ set, request }) => {
    if (!requestTargetsBorda({ request, collections })) {
      return;
    }
    set.headers['X-Powered-By'] = by;
  });

export const ensureApiKey = ({
  server,
  serverKey,
  serverHeaderPrefix,
  collections,
}: {
  server: Elysia;
  serverKey: string;
  serverHeaderPrefix: string;
  collections: CollectionInfo[];
}) =>
  server.onRequest(({ set, request }) => {
    if (!requestTargetsBorda({ request, collections })) {
      return;
    }

    const apiKeyHeaderKey = `${serverHeaderPrefix}-${InternalHeaders['apiKey']}`;
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

export async function ensureApiToken({
  set,
  path,
  request,
  cache,
  query,
  serverHeaderPrefix,
  params,
  cloud,
}: {
  set: any;
  path: string;
  request: BordaRequest & any;
  cache: Cache;
  query: (collection: string) => BordaServerQuery;
  serverHeaderPrefix: string;
  params: any;
  cloud: Cloud;
}) {
  let isPublicCloudFunction = false;
  let session: Session | null = null;
  let memo: Session | void;

  const { collectionName } = params || {};

  const token = request.headers.get(
    `${serverHeaderPrefix}-${InternalHeaders['apiToken']}`
  );
  const method =
    request.headers.get(
      `${serverHeaderPrefix}-${InternalHeaders['apiMethod']}`
    ) ?? '';

  const isUserSpecialRoutes =
    collectionName === 'User' &&
    ['signUp', 'signIn', 'passwordForgot', 'passwordReset'].includes(method);

  const isSpecialRoutes = isUserSpecialRoutes;
  const isLocked = !request.unlocked;

  if (path.startsWith('/run')) {
    // extract function name from `/run/:functionName`
    const functionName = path.split('/').pop() ?? '';
    const cloudFunction = cloud.getCloudFunction(functionName); // @todo move getCloudFunction Borda
    if (cloudFunction && cloudFunction.public) {
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
    return new BordaError(ErrorCode.UNAUTHORIZED, 'Unauthorized').toJSON();
  }

  return;
}

export const routeUnlock = ({
  server,
  serverSecret,
  serverHeaderPrefix,
  collections,
}: {
  server: Elysia;
  serverSecret: string;
  serverHeaderPrefix: string;
  collections: CollectionInfo[];
}) =>
  server.onRequest(({ request }: { request: any }) => {
    if (!requestTargetsBorda({ request, collections })) {
      return;
    }

    const apiSecret = request.headers.get(
      `${serverHeaderPrefix}-${InternalHeaders['apiSecret']}`
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
  collections,
}: {
  server: Elysia;
  serverHeaderPrefix: string;
  collections: CollectionInfo[];
}) =>
  server.onRequest(({ request }: { request: any }) => {
    if (!requestTargetsBorda({ request, collections })) {
      return;
    }
    const apiInspect = request.headers.get(
      `${serverHeaderPrefix}-${InternalHeaders['apiInspect']}`
    );
    // parse boolean
    const inspect = apiInspect === 'true' || apiInspect === true;
    if (inspect) {
      request.inspect = true;
    }
    return;
  });
