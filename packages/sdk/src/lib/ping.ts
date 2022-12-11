import { EleganteClient } from './Client';
import { fetch } from './fetch';
import { InternalHeaders } from './internal';

export function ping() {
  return fetch(`${EleganteClient.params.serverURL}/ping`, {
    headers: {
      'Content-Type': 'text/html',
      [`${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiKey']}`]:
        EleganteClient.params.apiKey,
    },
  });
}
