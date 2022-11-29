import fetch from 'cross-fetch';

export async function fetcher(
  url: string,
  options?: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: any;
    headers?: Record<string, string>;
  }
) {
  try {
    const fetchOptions = {
      method: options?.method ?? 'GET',
      headers: {
        ...(options?.headers ?? {
          'Content-type': 'application/json',
        }),
      },
      body: options?.body,
    };

    return fetch(url, fetchOptions).then(fetchHandleError);
  } catch (err) {
    return Promise.reject(err);
  }
}

export async function fetchHandleError(response: Response) {
  if (!response.ok || response.status >= 400) {
    return Promise.reject(response);
  }
  const contentType = response.headers.get('content-type') || '';
  return contentType.includes('json') ? response.json() : response.text();
}
