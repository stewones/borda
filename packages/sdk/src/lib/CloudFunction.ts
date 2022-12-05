import { EleganteClient } from './EleganteClient';
import { EleganteError, ErrorCode } from './EleganteError';
import { InternalHeaders } from './internal';
import { fetch } from './fetch';
import { Document } from './types/query';

export interface CloudFunctionOptions {
  isPublic?: boolean;
}

export type CloudFunctionProtocol = Map<string, CloudFunctionOptions>;

/**
 *
 *
 * @export
 * @template T
 * @param {string} name
 * @param {Document} [doc]
 * @returns {*}  {(Promise<T | T[] | void>)}
 */
export async function runFunction<T extends Document>(
  name: string,
  doc?: Document
): Promise<T | T[] | void> {
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

  return fetch<T>(`${EleganteClient.params.serverURL}/functions/${name}`, {
    method: 'POST',
    headers,
    body: doc,
  });
}
