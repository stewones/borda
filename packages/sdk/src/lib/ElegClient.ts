import { ElegClientParams } from './createClient';
import { fetch } from './fetch';
import { InternalHeaders } from './internal';

export interface ElegClientProtocol {
  params: ElegClientParams;
  ping: () => Promise<void>;
}

export const ElegClient: ElegClientProtocol = {
  params: {} as ElegClientParams,
  ping: () =>
    fetch(`${ElegClient.params.serverURL}/ping`, {
      headers: {
        'Content-Type': 'text/html',
        [`${ElegClient.params.serverHeaderPrefix}-${InternalHeaders['apiKey']}`]:
          ElegClient.params.apiKey,
      },
    }),
};
