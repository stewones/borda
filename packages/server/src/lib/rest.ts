import { Elysia, ElysiaConfig } from 'elysia';

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

export function createServer({
  config,
  serverHeaderPrefix,
  serverKey,
  poweredBy,
}: {
  name?: string;
  config?: Partial<ElysiaConfig>;
  serverHeaderPrefix: string;
  serverKey: string;
  poweredBy: string;
}) {
  const server = new Elysia(config);

  server.use(addPowered({ server, by: poweredBy }));
  server.use(ensureApiKey({ server, serverKey, serverHeaderPrefix }));
  server.all('/*', ({ path }) => {
    return `Hello Elysia from ${path}`;
  });

  return server;
}
