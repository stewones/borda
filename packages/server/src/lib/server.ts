/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Elysia,
  ElysiaConfig,
} from 'elysia';
import { Db } from 'mongodb';

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
import {
  handleOn,
  handleOnce,
} from './livequery';
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
  reservedCollections: string[];
  liveCollections: string[];
  cloud: Cloud;
  inspect: boolean;
}) {
  const server = new Elysia(config);
  const q = query;

  server.use(addPowered({ server, by: poweredBy }));
  server.use(pingRoute({ server }));

  // collection
  server.post(
    '/:collectionName',
    ({ params, request, body }) =>
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
      beforeHandle({ set, path, request, params }) {
        return bordaBeforeHandle({
          set,
          path,
          request,
          serverKey,
          serverHeaderPrefix,
          serverSecret,
          cache,
          query,
          params,
          cloud,
        });
      },
    }
  );

  server.put(
    '/:collectionName/:objectId',
    ({ params, request, body }) =>
      restCollectionPut({
        params,
        request,
        body,
        db,
        cache,
        cloud,
      }),
    {
      beforeHandle({ set, path, request, params }) {
        return bordaBeforeHandle({
          set,
          path,
          request,
          serverKey,
          serverHeaderPrefix,
          serverSecret,
          cache,
          query,
          params,
          cloud,
        });
      },
    }
  );

  server.get(
    '/:collectionName/:objectId',
    async ({ params, request, query }) =>
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
      beforeHandle({ set, path, request, params }) {
        return bordaBeforeHandle({
          set,
          path,
          request,
          serverKey,
          serverHeaderPrefix,
          serverSecret,
          cache,
          query,
          params,
          cloud,
        });
      },
    }
  );

  server.delete(
    '/:collectionName/:objectId',
    ({ params, request, body }) =>
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
      beforeHandle({ set, path, request, params }) {
        return bordaBeforeHandle({
          set,
          path,
          request,
          serverKey,
          serverHeaderPrefix,
          serverSecret,
          cache,
          query,
          params,
          cloud,
        });
      },
    }
  );

  // me
  server.get(
    '/me',
    ({ request }: { request: BordaRequest }) =>
      restUserMe({
        request,
      }),
    {
      beforeHandle({ set, path, request, params }) {
        return bordaBeforeHandle({
          set,
          path,
          request,
          serverKey,
          serverHeaderPrefix,
          serverSecret,
          cache,
          query,
          params,
          cloud,
        });
      },
    }
  );

  server.delete(
    '/me',
    ({ request }: { request: BordaRequest }) =>
      restUserSignOut({
        request,
        query,
      }),
    {
      beforeHandle({ set, path, request, params }) {
        return bordaBeforeHandle({
          set,
          path,
          request,
          serverKey,
          serverHeaderPrefix,
          serverSecret,
          cache,
          query,
          params,
          cloud,
        });
      },
    }
  );

  // run
  server.post(
    '/run/:functionName',
    ({ params, request, body, headers }) =>
      restFunctionRun({
        params,
        body,
        request,
        inspect,
        cloud,
        headers,
      }),
    {
      beforeHandle({ set, path, request, params }) {
        return bordaBeforeHandle({
          set,
          path,
          request,
          serverKey,
          serverHeaderPrefix,
          serverSecret,
          cache,
          query,
          params,
          cloud,
        });
      },
    }
  );

  // livequery
  server.ws('/:collectionName', {
    beforeHandle({ set, headers, params }) {
      return bordaBeforeHandleLiveQuery({
        set,
        headers,
        params,
        inspect,
        serverKey,
        serverSecret,
        reservedCollections,
        liveCollections,
      });
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

    error(error) {
      if (inspect) {
        console.log('Error:', error);
      }
    },

    async message(ws, message) {
      await bordaAfterHandleLiveQuery({
        ws,
        headers: ws.data.headers,
        cache,
        query,
        inspect,
      });

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

// function requestTargetsDatabase({
//   request,
//   collections,
// }: {
//   request: BordaRequest & any;
//   collections: CollectionInfo[];
// }) {
//   // extract the path from request.url
//   const path = new URL(request.url).pathname;
//   const collectionRequested = path.split('/')[1];
//   const collectionTargeted =
//     InternalCollectionName[collectionRequested] || collectionRequested;

//   const routesAvailable = [
//     'ping',
//     'run',
//     'live',
//     'me',
//     ...collections.map((c) => c.name),
//   ];

//   if (!routesAvailable.includes(collectionTargeted)) {
//     return false;
//   }

//   return true;
// }

export const addPowered = ({ server, by }: { server: Elysia; by: string }) =>
  server.onAfterHandle(({ set }) => {
    set.headers['X-Powered-By'] = by;
  });

export const ensureApiKey = ({
  request,
  set,
  serverKey,
  serverHeaderPrefix,
}: {
  request: any;
  set: any;
  serverKey: string;
  serverHeaderPrefix: string;
}) => {
  const apiKeyHeaderKey = `${serverHeaderPrefix}-${InternalHeaders['apiKey']}`;
  const apiKey = request.headers.get(apiKeyHeaderKey);

  if (!apiKey) {
    set.status = 400;
    return Promise.reject('API key required');
  }

  if (apiKey !== serverKey) {
    set.status = 401;
    return Promise.reject('Unauthorized API key');
  }

  return true;
};

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
    return Promise.reject(
      new BordaError(ErrorCode.UNAUTHORIZED, 'Unauthorized').toJSON()
    );
  }

  return;
}

export const routeUnlock = ({
  request,
  serverSecret,
  serverHeaderPrefix,
}: {
  request: any;
  serverSecret: string;
  serverHeaderPrefix: string;
}) => {
  const apiSecret = request.headers.get(
    `${serverHeaderPrefix}-${InternalHeaders['apiSecret']}`
  );
  if (apiSecret === serverSecret) {
    request.unlocked = true;
  }
  return true;
};

export const pingRoute = ({ server }: { server: Elysia }) =>
  server.get('/ping', () => '🏓');

export const queryInspect = ({
  request,
  serverHeaderPrefix,
}: {
  request: any;
  serverHeaderPrefix: string;
}) => {
  const apiInspect = request.headers.get(
    `${serverHeaderPrefix}-${InternalHeaders['apiInspect']}`
  );
  // parse boolean
  const inspect = apiInspect === 'true' || apiInspect === true;
  if (inspect) {
    request.inspect = true;
  }
  return;
};

export async function bordaBeforeHandle({
  set,
  path,
  request,
  serverKey,
  serverHeaderPrefix,
  serverSecret,
  cache,
  query,
  params,
  cloud,
}: {
  set: any;
  path: string;
  request: any;
  serverKey: string;
  serverHeaderPrefix: string;
  serverSecret: string;
  cache: Cache;
  query: (collection: string) => BordaServerQuery;
  params: any;
  cloud: Cloud;
}) {
  return (
    ensureApiKey({
      set,
      request,
      serverKey,
      serverHeaderPrefix,
    }) &&
    routeUnlock({
      request,
      serverSecret,
      serverHeaderPrefix,
    }) &&
    (await ensureApiToken({
      set,
      path,
      request,
      cache,
      query,
      params,
      serverHeaderPrefix,
      cloud,
    })) &&
    queryInspect({ request, serverHeaderPrefix })
  );
}

function bordaBeforeHandleLiveQuery({
  set,
  headers,
  params,
  inspect,
  serverKey,
  serverSecret,
  reservedCollections,
  liveCollections,
}: {
  set: any;
  headers: any;
  params: any;
  inspect?: boolean;
  serverKey: string;
  serverSecret: string;
  reservedCollections: string[];
  liveCollections: string[];
}) {
  // extract websocket protocols from headers
  const protocols = headers['sec-websocket-protocol'];
  // 'apiKey#token#secret'

  // extract session token from protocols
  const protocolsArray = protocols ? protocols.split('#') : [];
  const apiKey = protocolsArray[0] && protocolsArray[0].trim();
  const token = protocolsArray[1] && protocolsArray[1].trim();

  const hasToken = token && token !== 'null' && token !== 'undefined';
  let apiSecret: string | undefined =
    protocolsArray[2] && protocolsArray[2].trim();

  const collection =
    InternalCollectionName[params.collectionName] || params.collectionName;

  apiSecret =
    apiSecret && apiSecret !== 'undefined' && apiSecret !== 'null'
      ? apiSecret
      : undefined;

  if (inspect) {
    console.log('🔒LiveQuery', apiKey, token, apiSecret);
  }

  if (apiKey !== serverKey) {
    if (inspect) {
      console.log('⚡LiveQuery: Invalid API Key');
    }
    set.status = 1000;
    return Promise.reject('Invalid key');
  }

  // check for secret
  if (apiSecret && apiSecret !== serverSecret) {
    set.status = 1000;
    if (inspect) {
      console.log('⚡LiveQuery: Invalid Secret');
    }
    return Promise.reject('Invalid secret');
  }

  /**
   * secret allowed throw exception if the requested collection is not defined
   */
  if (!apiSecret && !liveCollections.includes(collection)) {
    if (inspect) {
      console.log('Collection not allowed');
    }
    set.status = 1000;
    return Promise.reject('Collection not allowed');
  }

  if (!apiSecret && reservedCollections.includes(collection)) {
    const message = `You can't subscribe to the collection ${collection} because it's reserved`;
    if (inspect) {
      console.log(message);
    }
    set.status = 1000;
    return Promise.reject(message);
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
    set.status = 1000;
    if (inspect) {
      console.log('⚡LiveQuery: Invalid session');
    }
    return Promise.reject('Invalid session');
  }

  return;
}

async function bordaAfterHandleLiveQuery({
  ws,
  headers,
  cache,
  query,
  inspect,
}: {
  ws: any;
  headers: any;
  cache: Cache;
  inspect?: boolean;
  query: (collection: string) => BordaServerQuery;
}) {
  // extract websocket protocols from headers
  const protocols = headers['sec-websocket-protocol'];
  // 'apiKey#token#secret'

  // extract session token from protocols
  const protocolsArray = protocols ? protocols.split('#') : [];
  const token = protocolsArray[1] && protocolsArray[1].trim();
  const hasToken = token && token !== 'null' && token !== 'undefined';
  let apiSecret: string | undefined =
    protocolsArray[2] && protocolsArray[2].trim();

  apiSecret =
    apiSecret && apiSecret !== 'undefined' && apiSecret !== 'null'
      ? apiSecret
      : undefined;

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
        return;
      } else {
        if (inspect) {
          console.log('⚡LiveQuery: Invalid session');
        }
        return ws.close(1000, 'Invalid session');
      }
    }
  }

  if (!apiSecret) {
    return ws.close(1000, 'Invalid session');
  }

  return;
}
