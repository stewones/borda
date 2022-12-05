import { EleganteClientParams } from './createClient';
import { fetch } from './fetch';
import { InternalHeaders } from './internal';

export interface EleganteClientProtocol {
  params: EleganteClientParams;
  ping: () => Promise<void>;
}

export const EleganteClient: EleganteClientProtocol = {
  params: {} as EleganteClientParams,
  ping: () =>
    fetch(`${EleganteClient.params.serverURL}/ping`, {
      headers: {
        'Content-Type': 'text/html',
        [`${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiKey']}`]:
          EleganteClient.params.apiKey,
      },
    }),
};
