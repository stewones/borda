import { EleganteClientParams } from './createClient';
import { fetcher } from './utils/fetcher';

export interface EleganteClientProtocol {
  params: EleganteClientParams;
  ping: () => Promise<void>;
}

export const EleganteClient: EleganteClientProtocol = {
  params: {} as EleganteClientParams,
  ping: () =>
    fetcher(`${EleganteClient.params.serverURL}/ping`, {
      headers: {
        'X-Elegante-Api-Key': EleganteClient.params.apiKey,
      },
    }),
};
