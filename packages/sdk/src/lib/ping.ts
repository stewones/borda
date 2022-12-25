/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

import { EleganteClient } from './Client';
import { fetch } from './fetch';
import { InternalHeaders } from './internal';

export function ping() {
  return fetch(`${EleganteClient.params.serverURL}/ping`, {
    headers: {
      'Content-Type': 'text/html',
      [`${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiKey']}`]:
        EleganteClient.params.apiKey,
    },
  });
}
