/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

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

  if (!isServer()) {
    LocalStorage.estimate().then(({ percentageAvailable, remainingMB }) =>
      log(
        'LocalStorage',
        `${percentageAvailable}% available (${remainingMB.toFixed(0)} MB)`
      )
    );
  }

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
