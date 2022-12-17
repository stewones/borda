import { Subject } from 'rxjs';
import { ElegantePlugin } from './Plugin';

export interface ClientProtocol {
  params: ClientParams;
  pubsub: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: Subject<any>;
  };
}

export const EleganteClient: ClientProtocol = {
  params: {} as ClientParams,
  pubsub: {},
};

export interface ClientParams {
  apiKey: string;
  apiSecret?: string;
  serverURL: string;
  serverHeaderPrefix?: string;
  liveQueryServerURL?: string;
  debug?: boolean;
  plugins?: ElegantePlugin[];
}

export const ClientDefaultParams: Partial<ClientParams> = {
  serverHeaderPrefix: 'X-Elegante',
  debug: true,
  plugins: [],
};
