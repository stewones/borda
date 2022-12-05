import { EleganteClient } from './EleganteClient';
import { EleganteError, ErrorCode } from './EleganteError';
import { log, isServer } from './utils';
import { Version } from './Version';

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
export function createClient(options: EleganteClientParams) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const params = (EleganteClient.params = {
    ...EleganteClientDefaultParams,
    ...options,
  });

  if (!isServer() && params.apiSecret) {
    throw new EleganteError(
      ErrorCode.SERVER_SECRET_EXPOSED,
      'Server secret exposed in client'
    );
  }

  log(`Elegante SDK v${Version}`);
  return EleganteClient;
}
