/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

import { EleganteClient } from './Client';
import { EleganteError, ErrorCode } from './Error';
import { fetch } from './fetch';
import { InternalHeaders } from './internal';
import { Document } from './types/query';
import { cleanKey, isServer, LocalStorage } from './utils';

export function runFunction<T = Document>(
  name: string,
  doc?: Document,
  options?: {
    headers?: Record<string, string>;
  }
) {
  if (!EleganteClient.params.apiKey) {
    throw new EleganteError(ErrorCode.AUTH_INVALID_API_KEY, 'API key required');
  }

  if (!EleganteClient.params.serverURL) {
    throw new EleganteError(
      ErrorCode.SERVER_URL_UNDEFINED,
      'serverURL is not defined on client'
    );
  }

  const headers = {
    [`${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiKey']}`]:
      EleganteClient.params.apiKey,
    ...options?.headers,
  };

  if (!isServer()) {
    const token = LocalStorage.get(
      `${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiToken']}`
    );
    if (token) {
      headers[
        `${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiToken']}`
      ] = token;
    }
  } else {
    if (EleganteClient.params.apiSecret) {
      headers[
        `${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiSecret']}`
      ] = EleganteClient.params.apiSecret;
    }
  }

  const source = fetch<T>(
    `${EleganteClient.params.serverURL}/functions/${name}`,
    {
      method: 'POST',
      headers,
      body: doc,
    }
  );

  Reflect.defineMetadata('key', cleanKey({ function: name, ...doc }), source);

  return source;
}

export function runJob<T = Document>(name: string, doc?: Document): Promise<T> {
  if (!EleganteClient.params.apiKey) {
    throw new EleganteError(ErrorCode.AUTH_INVALID_API_KEY, 'API key required');
  }

  if (!EleganteClient.params.apiSecret) {
    throw new EleganteError(
      ErrorCode.SERVER_SECRET_REQUIRED,
      'API secret is required to run a job'
    );
  }

  if (!EleganteClient.params.serverURL) {
    throw new EleganteError(
      ErrorCode.SERVER_URL_UNDEFINED,
      'serverURL is not defined on client'
    );
  }

  const headers = {
    [`${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiKey']}`]:
      EleganteClient.params.apiKey,
    [`${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiSecret']}`]:
      EleganteClient.params.apiSecret,
  };

  const source = fetch<T>(`${EleganteClient.params.serverURL}/jobs/${name}`, {
    method: 'POST',
    headers,
    body: doc,
  });

  Reflect.defineMetadata('key', cleanKey({ job: name, ...doc }), source);

  return source;
}
