import { ElegClient } from './ElegClient';

export interface WebSocketCallback {
  onConnect: (ws: WebSocket) => void;
  onOpen: (ws: WebSocket, ev: Event) => void;
  onError: (ws: WebSocket, err: Event) => void;
  onClose: (ws: WebSocket, ev: CloseEvent) => void;
  onMessage: (ws: WebSocket, message: MessageEvent) => void;
}

export function webSocketServer(socketURL: string) {
  return (callback: WebSocketCallback) => {
    const { onConnect, onOpen, onError, onClose, onMessage } = callback;

    const ws = new WebSocket(socketURL, [
      `${ElegClient.params.apiKey}`,
      `sessionToken`, // @todo send sessionToken over the wire to also validade the ws connection
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
  const serverURL = ElegClient.params.serverURL;

  // replace port with socket port
  const socketURLWithPort = serverURL.replace(/:(\d+)/, `:3136`);

  // replace http:// or https:// with ws:// or wss://
  const socketProtocol = socketURLWithPort.startsWith('https://')
    ? 'wss://'
    : 'ws://';

  // replace socketURLWithPort with protocol considering both http and https
  const socketURLWithMount =
    socketProtocol + socketURLWithPort.replace(/https?:\/\//, '');

  const socketURL = ElegClient.params.liveQueryServerURL
    ? ElegClient.params.liveQueryServerURL
    : socketURLWithMount.replace(/\/[^/]*$/, '');

  return socketURL;
}
