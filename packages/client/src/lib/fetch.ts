/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { fetch as fetcher } from 'cross-fetch';

import { EleganteClient } from './Client';
import { isServer } from './utils';
import { Version } from './Version';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export async function fetch<T = any>(
  url: string,
  options?: {
    method?: HttpMethod;
    body?: any;
    headers?: Record<string, string>;
  }
): Promise<T> {
  const fetchOptions: any = {
    method: options?.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
      ...(isServer() && !options?.headers?.['user-agent']
        ? {
            'user-agent': `Elegante/${Version}; +https://elegante.dev`,
          }
        : {}),
    },
  };

  if (isServer()) {
    // needs to add https agent from outside
    // { fetch: { agent: new https.Agent({ rejectUnauthorized: false }) } }
    const paramsFetch = EleganteClient.params.fetch;
    if (paramsFetch && paramsFetch.agent) {
      fetchOptions.agent = EleganteClient.params.fetch?.agent;
    }
  }

  if (EleganteClient.params.fetch?.headers) {
    const headers = EleganteClient.params.fetch?.headers;
    if (typeof headers === 'function') {
      fetchOptions.headers = {
        ...fetchOptions.headers,
        ...headers(),
      };
    } else if (typeof headers === 'object') {
      fetchOptions.headers = {
        ...fetchOptions.headers,
        ...headers,
      };
    }
  }

  if (options?.body) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  return fetcher(url, fetchOptions).then(async (response: Response) => {
    const contentType = response.headers.get('content-type') || '';
    const contentResponse = contentType.includes('json')
      ? await response.json()
      : await response.text();

    if (!response.ok || response.status >= 400) {
      return Promise.reject(contentResponse);
    }

    return contentResponse;
  });
  // .catch((err) => {
  //   /**
  //    * if we don't have a proper response means it's
  //    * a generic error so we reject it as a generic network error
  //    * to make the log easier to read and trace
  //    */
  //   if (!err.code) {
  //     /**
  //      * easy way to test if it's a network error
  //      * is to just shutdown Elegante Server
  //      * and try to run the Client SDK
  //      */
  //     throw new EleganteError(ErrorCode.NETWORK_ERROR, err as object);
  //   } else {
  //     throw err;
  //   }
  // });
}
