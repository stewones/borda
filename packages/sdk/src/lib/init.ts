import { Auth } from './Auth';
import { EleganteError, ErrorCode } from './Error';
import { InternalHeaders } from './internal';
import { log } from './log';
import { isServer, LocalStorage } from './utils';
import { Version } from './Version';

import { EleganteClient, ClientDefaultParams, ClientParams } from './Client';

/**
 * configure a new elegante client
 *
 * @export
 * @param {ClientParams} options
 * @returns {*}
 */
export async function init(options: ClientParams) {
  log(`Elegante SDK v${Version}`);

  LocalStorage.estimate().then(({ percentageAvailable, remainingMB }) =>
    log(
      'storage',
      `${percentageAvailable}% available (${remainingMB.toFixed(0)} MB)`
    )
  );

  const params = (EleganteClient.params = {
    ...ClientDefaultParams,
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
