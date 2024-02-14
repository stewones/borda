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
  #app!: string;
  #serverKey!: string;
  #serverSecret!: string;
  #serverURL!: string;
  #serverHeaderPrefix!: string;

  constructor({
    app,
    serverKey,
    serverSecret,
    serverURL,
    serverHeaderPrefix,
  }: {
    app: string;
    serverKey: string;
    serverSecret: string;
    serverURL: string;
    serverHeaderPrefix: string;
  }) {
    this.#app = app;
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
    Reflect.defineMetadata('app', this.#app, source);

    return source;
  }
}