import { Document } from './types';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
export type FetchResponse<T = Document> = T & {
  data: T;
  status: number;
  headers: Headers;
};

export async function fetcher<T = Document>(
  url: string,
  options?: {
    method?: HttpMethod;
    body?: Document | null;
    headers?: Record<string, string>;
    direct?: boolean; // direct responses
  }
): Promise<FetchResponse<T>> {
  const fetchOptions: Document = {
    method: options?.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  };

  if (options?.body) {
    fetchOptions['body'] = JSON.stringify(options.body);
  }

  return fetch(url, fetchOptions).then(async (response: Response) => {
    const contentType = response.headers.get('content-type') || '';
    const contentResponse = contentType.includes('json')
      ? await response.json()
      : await response.text();

    if (!response.ok || response.status >= 400) {
      if (options?.direct) {
        return Promise.reject(contentResponse);
      }
      return Promise.reject({
        data: contentResponse,
        status: response.status,
      });
    }

    if (options?.direct) {
      return contentResponse as FetchResponse<T>;
    } else {
      return {
        data: await response.json(),
        status: response.status,
        headers: response.headers,
      } as FetchResponse<T>;
    }
  });
}
