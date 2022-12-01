/* eslint-disable @typescript-eslint/no-explicit-any */
import { fetch as fetcher } from 'cross-fetch';
import { ElegError, ErrorCode } from './ElegError';
import { isServer } from './utils';
import { Version } from './Version';

export async function fetch<T = any>(
  url: string,
  options?: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: any;
    headers?: Record<string, string>;
  }
): Promise<T> {
  const fetchOptions: any = {
    method: options?.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      'user-agent': `Elegante/${Version}; ${
        isServer() ? 'Server' : 'Browser'
      } Platform; +https://elegante.dev`,
      ...options?.headers,
    },
  };

  if (options?.body) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  return fetcher(url, fetchOptions)
    .then(fetchHandleError)
    .catch((err) => {
      /**
       * if we don't have a proper response means it's
       * a generic error so we reject it as a generic network error
       * to make the log easier to read and trace
       */
      if (!err.code) {
        /**
         * easy way to test if it's a network error
         * is to just shutdown Elegante Server
         * and try to run the Client SDK
         */
        Promise.reject(new ElegError(ErrorCode.NETWORK_ERROR, err as object));
      }
    });
}

export async function fetchHandleError(response: Response) {
  const contentType = response.headers.get('content-type') || '';
  const contentResponse = contentType.includes('json')
    ? await response.json()
    : await response.text();

  if (!response.ok || response.status >= 400) {
    return Promise.reject(contentResponse);
  }

  return contentResponse;
}
