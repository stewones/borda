import { EleganteClient } from './Client';
import { EleganteError, ErrorCode } from './Error';
import { InternalHeaders } from './internal';
import { fetch } from './fetch';
import { Document } from './types/query';
import { isServer, LocalStorage } from './utils';

export async function runFunction<T = Document>(
  name: string,
  doc?: Document
): Promise<T> {
  if (!EleganteClient.params.apiKey) {
    throw new EleganteError(ErrorCode.INVALID_API_KEY, 'API key required');
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

export async function runJob<T = Document>(
  name: string,
  doc?: Document
): Promise<T> {
  if (!EleganteClient.params.apiKey) {
    throw new EleganteError(ErrorCode.INVALID_API_KEY, 'API key required');
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

  return fetch<T>(`${EleganteClient.params.serverURL}/jobs/${name}`, {
    method: 'POST',
    headers,
    body: doc,
  });
}
