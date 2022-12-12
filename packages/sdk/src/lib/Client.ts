import { ElegantePlugin } from './Plugin';

export interface ClientProtocol {
  params: ClientParams;
}

export const EleganteClient: ClientProtocol = {
  params: {} as ClientParams,
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
