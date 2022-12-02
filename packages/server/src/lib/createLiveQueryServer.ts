import { Db, MongoClient } from 'mongodb';
import { ElegError, ErrorCode, log, Version } from '@elegante/sdk';

import { IncomingMessage } from 'http';
import WebSocket, { Server, ServerOptions } from 'ws';
import { newObjectId } from './utils/crypto';

export interface LiveQueryServerParams extends ServerOptions {
  collections: string[]; // allowed collections
  port: number;
}

export interface LiveQueryServerEvents {
  onLiveQueryConnect: (
    ws: Server,
    socket: WebSocket,
    request: IncomingMessage,
    clients: Map<any, any>
  ) => void;
}

export function createLiveQueryServer(
  options: LiveQueryServerParams,
  events: LiveQueryServerEvents = {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
    onLiveQueryConnect: () => {},
  }
) {
  const { onLiveQueryConnect } = events;

  const wss = new WebSocket.Server(options);
  const clients = new Map();

  wss.on(
    'connection',
    (ws: Server, socket: WebSocket, request: IncomingMessage) => {
      const id = newObjectId();
      const metadata = { id };

      clients.set(ws, metadata);
      onLiveQueryConnect(ws, socket, request, clients);

      // multicast to all clients
      ws.on('message', (messageAsString: string) => {
        const message = JSON.parse(messageAsString);
        const metadata = clients.get(ws);
        message.sender = metadata.id;

        const outbound = JSON.stringify(message);

        [...clients.keys()].forEach((client) => {
          client.send(outbound);
        });
      });

      ws.on('close', () => {
        clients.delete(ws);
      });
    }
  );

  log(`Elegante LiveQuery started`);
}
