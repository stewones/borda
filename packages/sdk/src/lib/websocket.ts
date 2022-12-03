import { ElegClient } from './ElegClient';

export async function connectToServer(
  socketURL: string,
  callback: (ws: WebSocket) => void
) {
  const ws = new WebSocket(socketURL, [
    `${ElegClient.params.apiKey}`,
    `sessionToken`, // @todo send sessionToken over the wire to also validade the ws connection
  ]);

  const timer = setInterval(() => {
    if (ws.readyState === 1) {
      clearInterval(timer);
      callback(ws);
    }
  }, 10);
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
