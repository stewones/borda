/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */
import WebSocket, {
  CloseEvent,
  ErrorEvent,
  Event,
  MessageEvent,
} from 'isomorphic-ws';

import { EleganteClient } from './Client';

export interface WebSocketFactory {
  onConnect: (ws: WebSocket) => void;
  onOpen: (ws: WebSocket, ev: Event) => void;
  onError: (ws: WebSocket, err: Event) => void;
  onClose: (ws: WebSocket, ev: CloseEvent) => void;
  onMessage: (ws: WebSocket, message: MessageEvent) => void;
}

export function webSocketServer(
  socketURL: string,
  apiKey = EleganteClient.params.apiKey,
  token = EleganteClient.params.sessionToken || null,
  secret: string | null = null
) {
  return (factory: WebSocketFactory) => {
    const { onConnect, onOpen, onError, onClose, onMessage } = factory;

    // console.log([`${apiKey}`, `${token}`, ...(secret ? [secret] : [])]);

    const ws = new WebSocket(socketURL, [
      `${apiKey}`,
      `${token?.replace(':', '')}`,
      ...(secret ? [secret] : []),
    ]);

    ws.onopen = (ev: Event) => onOpen(ws, ev);
    ws.onerror = (err: ErrorEvent) => onError(ws, err);
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

export function getUrl() {
  const serverURL = EleganteClient.params.serverURL;

  // replace port with socket port
  // const socketURLWithPort = serverURL.replace(/:(\d+)/, `:1338`);
  const socketURLWithPort = serverURL;

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
