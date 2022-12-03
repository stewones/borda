import { ElegClient } from './ElegClient';
import { ElegError, ErrorCode } from './ElegError';
import { log, isServer } from './utils';
import { Version } from './Version';

export interface ElegClientParams {
  apiKey: string;
  apiSecret?: string;
  serverURL: string;
  serverHeaderPrefix?: string;
  liveQueryServerURL?: string;
  debug?: boolean;
}

const ElegClientDefaultParams: Partial<ElegClientParams> = {
  serverHeaderPrefix: 'X-Elegante',
  debug: true,
};

/**
 * configure a new elegante client
 *
 * @export
 * @param {ElegClientParams} options
 * @returns {*}
 */
export function createClient(options: ElegClientParams) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const params = (ElegClient.params = {
    ...ElegClientDefaultParams,
    ...options,
  });

  if (!isServer() && params.apiSecret) {
    throw new ElegError(
      ErrorCode.SERVER_SECRET_EXPOSED,
      'Server secret exposed in client'
    );
  }

  log(`Elegante SDK v${Version}`);
  return ElegClient;
}
