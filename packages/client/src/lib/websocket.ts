/**
 * @license
 * Copyright Borda All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://borda.dev/license
 */
// import WebSocket, {
//   CloseEvent,
//   ErrorEvent,
//   Event,
//   MessageEvent,
// } from 'isomorphic-ws';


export interface WebSocketFactory {
  onConnect: (ws: WebSocket) => void;
  onOpen: (ws: WebSocket, ev: Event) => void;
  onError: (ws: WebSocket, err: Event) => void;
  onClose: (ws: WebSocket, ev: CloseEvent) => void;
  onMessage: (ws: WebSocket, message: MessageEvent) => void;
}

export function webSocketServer({
  socketURL,
  serverKey,
  token,
  secret,
}: {
  socketURL: string;
  serverKey: string;
  token: string | null;
  secret?: string;
}) {
  return (factory: WebSocketFactory) => {
    const { onConnect, onOpen, onError, onClose, onMessage } = factory;
    const ws = new WebSocket(socketURL, [
      `${serverKey}#${token?.replace(':', '')}#${secret}`,
    ]);

    ws.onopen = (ev: Event) => onOpen(ws, ev);
    ws.onerror = (err: Event) => onError(ws, err);
    ws.onclose = (ev: CloseEvent) => onClose(ws, ev);
    ws.onmessage = (ev: MessageEvent) => onMessage(ws, ev);

    const timer = setInterval(() => {
      if (ws.readyState === 1) {
        clearInterval(timer);
        onConnect(ws);
      }
    }, 10);
  };
}

export function getWebSocketURL({ serverURL }: { serverURL: string }) {
  // replace http or https with ws or wss depending on the protocol
  if (serverURL.startsWith('http://')) {
    return serverURL.replace('http', 'ws');
  }

  return serverURL.replace('https', 'wss');
}
