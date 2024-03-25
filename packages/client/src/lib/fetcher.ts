import { Document } from './types';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
export type FetchResponse<T = Document> = T & {
  data: T;
  status: number;
  headers: Headers;
};

export interface FetchError {
  data: string;
  status: number;
  [key: string]: unknown;
}

export async function fetcher<T = Document, E = FetchError>(
  url: string,
  options?: {
    method?: HttpMethod;
    body?: Document | null;
    headers?: Record<string, string>;
    direct?: boolean; // direct responses (borda doesn't touch it)
    transform?: (response: unknown) => E; // transform response before returning
  }
): Promise<FetchResponse<T>> {
  const transformResponse = (response: unknown) => {
    if (options?.transform) {
      return options.transform(response);
    }
    return response;
  };
  const fetchOptions: Document = {
    method: options?.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  };

  if (options?.body) {
    fetchOptions['body'] = JSON.stringify(options.body);
  } else {
    if (options?.method && options.method !== 'GET') {
      fetchOptions['body'] = JSON.stringify({});
    }
  }

  if (!fetchOptions['headers']['Content-Type']) {
    fetchOptions['headers']['Content-Type'] = 'application/json';
  }

  return fetch(url, fetchOptions).then(async (response: Response) => {
    const contentType = response.headers.get('content-type') || '';
    const contentResponse = contentType.includes('json')
      ? await response.json()
      : await response.text();

    if (!response.ok || response.status >= 400) {
      if (options?.direct) {
        return Promise.reject(transformResponse(contentResponse));
      }
      return Promise.reject(
        transformResponse({
          data: contentResponse,
          status: response.status,
        })
      );
    }

    if (options?.direct) {
      return transformResponse(contentResponse) as FetchResponse<T>;
    } else {
      return transformResponse({
        data: await response.json(),
        status: response.status,
        headers: response.headers,
      }) as FetchResponse<T>;
    }
  });
}
