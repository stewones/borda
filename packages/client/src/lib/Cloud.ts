/**
 * @license
 * Copyright Borda All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://borda.dev/license
 */

import { BordaError, ErrorCode } from './Error';
import { fetcher } from './fetcher';
import { InternalHeaders } from './internal';
import { Document } from './types/query';
import { cleanKey, isServer, LocalStorage } from './utils';

export class Cloud {
  #serverKey!: string;
  #serverSecret!: string;
  #serverURL!: string;
  #serverHeaderPrefix!: string;

  constructor({
    serverKey,
    serverSecret,
    serverURL,
    serverHeaderPrefix,
  }: {
    serverKey: string;
    serverSecret: string;
    serverURL: string;
    serverHeaderPrefix: string;
  }) {
    this.#serverKey = serverKey;
    this.#serverSecret = serverSecret;
    this.#serverURL = serverURL;
    this.#serverHeaderPrefix = serverHeaderPrefix;
  }

  run<T = Document>(
    name: string,
    doc?: Document,
    options?: {
      headers?: Record<string, string>;
    }
  ) {
    if (!this.#serverKey) {
      throw new BordaError(
        ErrorCode.AUTH_INVALID_API_KEY,
        'serverKey required'
      );
    }

    if (!this.#serverURL) {
      throw new BordaError(
        ErrorCode.SERVER_URL_UNDEFINED,
        'serverURL is not defined on client'
      );
    }

    const headers = {
      [`${this.#serverHeaderPrefix}-${InternalHeaders['apiKey']}`]:
        this.#serverKey,
      ...options?.headers,
    };

    if (!isServer()) {
      const token = LocalStorage.get(
        `${this.#serverHeaderPrefix}-${InternalHeaders['apiToken']}`
      );
      if (token) {
        headers[`${this.#serverHeaderPrefix}-${InternalHeaders['apiToken']}`] =
          token;
      }
    } else {
      if (this.#serverSecret) {
        headers[`${this.#serverHeaderPrefix}-${InternalHeaders['apiSecret']}`] =
          this.#serverSecret;
      }
    }

    const source = fetcher<T>(`${this.#serverURL}/run/${name}`, {
      method: 'POST',
      headers,
      body: doc,
      direct: true,
    });

    Reflect.defineMetadata('key', cleanKey({ function: name, ...doc }), source);

    return source;
  }
}

// @todo: implement jobs
// export function runJob<T = Document>(
//   name: string,
//   doc?: Document
// ): Promise<T> {
//   if (!EleganteClient.params.apiKey) {
//     throw new BordaError(ErrorCode.AUTH_INVALID_API_KEY, 'API key required');
//   }

//   if (!EleganteClient.params.apiSecret) {
//     throw new BordaError(
//       ErrorCode.SERVER_SECRET_REQUIRED,
//       'API secret is required to run a job'
//     );
//   }

//   if (!EleganteClient.params.serverURL) {
//     throw new BordaError(
//       ErrorCode.SERVER_URL_UNDEFINED,
//       'serverURL is not defined on client'
//     );
//   }

//   const headers = {
//     [`${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiKey']}`]:
//       EleganteClient.params.apiKey,
//     [`${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiSecret']}`]:
//       EleganteClient.params.apiSecret,
//   };

//   const source = fetch<T>(`${EleganteClient.params.serverURL}/jobs/${name}`, {
//     method: 'POST',
//     headers,
//     body: doc,
//   });

//   Reflect.defineMetadata('key', cleanKey({ job: name, ...doc }), source);

//   return source;
// }
