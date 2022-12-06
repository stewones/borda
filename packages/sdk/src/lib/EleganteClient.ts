import { Auth } from './Auth';
import { EleganteError, ErrorCode } from './EleganteError';
import { InternalHeaders } from './internal';
import { log } from './log';
import { isServer, LocalStorage } from './utils';
import { Version } from './Version';

export interface EleganteClientProtocol {
  params: EleganteClientParams;
}

export const EleganteClient: EleganteClientProtocol = {
  params: {} as EleganteClientParams,
};

export interface EleganteClientParams {
  apiKey: string;
  apiSecret?: string;
  serverURL: string;
  serverHeaderPrefix?: string;
  liveQueryServerURL?: string;
  debug?: boolean;
}

const EleganteClientDefaultParams: Partial<EleganteClientParams> = {
  serverHeaderPrefix: 'X-Elegante',
  debug: true,
};

/**
 * configure a new elegante client
 *
 * @export
 * @param {EleganteClientParams} options
 * @returns {*}
 */
export async function createClient(options: EleganteClientParams) {
  log(`Elegante SDK v${Version}`);

  const params = (EleganteClient.params = {
    ...EleganteClientDefaultParams,
    ...options,
  });

  if (!isServer()) {
    if (params.apiSecret) {
      throw new EleganteError(
        ErrorCode.SERVER_SECRET_EXPOSED,
        'Server secret exposed in client'
      );
    }

    const token = LocalStorage.get(
      `${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiToken']}`
    );

    if (token) {
      return Auth.become(token);
    }
    return Promise.resolve();
  }
}
