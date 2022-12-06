import { EleganteClient } from './EleganteClient';
import { EleganteError, ErrorCode } from './EleganteError';
import { InternalHeaders } from './internal';
import { fetch } from './fetch';
import { Document } from './types/query';
import { isServer, LocalStorage } from './utils';

export async function runFunction<T = Document>(
  name: string,
  doc?: Document
): Promise<T> {
  if (!EleganteClient.params.serverURL) {
    throw new EleganteError(
      ErrorCode.SERVER_URL_UNDEFINED,
      'serverURL is not defined on client'
    );
  }

  const headers = {
    [`${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiKey']}`]:
      EleganteClient.params.apiKey,
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

  return fetch<T>(`${EleganteClient.params.serverURL}/functions/${name}`, {
    method: 'POST',
    headers,
    body: doc,
  });
}
