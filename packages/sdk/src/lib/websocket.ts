/**
 * @license
 * Copyright Intenseloop LTD All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

import { EleganteClient } from './Client';

export interface WebSocketFactory {
  onConnect: (ws: WebSocket) => void;
  onOpen: (ws: WebSocket, ev: Event) => void;
  onError: (ws: WebSocket, err: Event) => void;
  onClose: (ws: WebSocket, ev: CloseEvent) => void;
  onMessage: (ws: WebSocket, message: MessageEvent) => void;
}

export function webSocketServer(socketURL: string) {
  return (factory: WebSocketFactory) => {
    const { onConnect, onOpen, onError, onClose, onMessage } = factory;

    const ws = new WebSocket(socketURL, [
      `${EleganteClient.params.apiKey}`,
      `token`, // @todo send token over the wire to also validade the ws connection
    ]);

    ws.onopen = (ev) => onOpen(ws, ev);
    ws.onerror = (err) => onError(ws, err);
    ws.onclose = (ev) => onClose(ws, ev);
    ws.onmessage = (ev) => onMessage(ws, ev);

    const timer = setInterval(() => {
      if (ws.readyState === 1) {
        clearInterval(timer);
        onConnect(ws);
      }
    }, 10);
  };
}

export function getUrl() {
  const serverURL = EleganteClient.params.serverURL;

  // replace port with socket port
  const socketURLWithPort = serverURL.replace(/:(\d+)/, `:1338`);

  // replace http:// or https:// with ws:// or wss://
  const socketProtocol = socketURLWithPort.startsWith('https://')
    ? 'wss://'
    : 'ws://';

  // replace socketURLWithPort with protocol considering both http and https
  const socketURLWithMount =
    socketProtocol + socketURLWithPort.replace(/https?:\/\//, '');

  const socketURL = EleganteClient.params.liveQueryServerURL
    ? EleganteClient.params.liveQueryServerURL
    : socketURLWithMount.replace(/\/[^/]*$/, '');

  return socketURL;
}
