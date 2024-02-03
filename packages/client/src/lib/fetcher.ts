export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export async function fetcher<T = any>(
  url: string,
  options?: {
    method?: HttpMethod;
    body?: any;
    headers?: Record<string, string>;
  },
): Promise<{
  data: T;
  status: number;
  headers: Headers;
}> {
  const fetchOptions: any = {
    method: options?.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  };

  if (options?.body) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  return fetch(url, fetchOptions).then(async (response: Response) => {
    const contentType = response.headers.get('content-type') || '';
    const contentResponse = contentType.includes('json')
      ? await response.json()
      : await response.text();

    if (!response.ok || response.status >= 400) {
      return Promise.reject({
        data: contentResponse,
        status: response.status,
      });
    }

    return {
      data: contentResponse,
      status: response.status,
      headers: response.headers,
    };
  });
}
