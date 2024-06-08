/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * @license
 * Copyright Borda All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://borda.dev/license
 */

import { Auth } from './Auth';
import { BordaServerAdditionalHeaders } from './Borda';
import { BordaError, ErrorCode } from './Error';
import { fetcher as Fetcher } from './fetcher';
import { InternalHeaders } from './internal';
import { Document } from './types/query';
import { cleanKey, isServer } from './utils';

export class Cloud {
  #app!: string;
  #auth!: Auth;
  #serverKey!: string;
  #serverSecret!: string;
  #serverURL!: string;
  #serverHeaderPrefix!: string;

  public get auth() {
    return this.#auth;
  }

  constructor({
    app,
    auth,
    serverKey,
    serverSecret,
    serverURL,
    serverHeaderPrefix,
  }: {
    app: string;
    auth: Auth;
    serverKey: string;
    serverSecret: string;
    serverURL: string;
    serverHeaderPrefix: string;
    serverAdditionalHeaders?: BordaServerAdditionalHeaders;
  }) {
    this.#app = app;
    this.#auth = auth;
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
      fetch?: any; // a custom fetch function. usefull for workers
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

    const token = this.#auth.sessionToken;

    const headers = this.#auth.getHeaders({
      token,
    });

    if (options?.headers) {
      Object.assign(headers, options.headers);
    }

    if (isServer()) {
      if (this.#serverSecret) {
        headers[`${this.#serverHeaderPrefix}-${InternalHeaders['apiSecret']}`] =
          this.#serverSecret;
      }
    }

    const fetcher = options?.fetch || Fetcher;

    const source = fetcher(`${this.#serverURL}/run/${name}`, {
      method: 'POST',
      headers,
      body: doc,
      direct: true,
    });

    if (typeof Reflect !== 'undefined' && Reflect.defineMetadata) {
      Reflect.defineMetadata(
        'key',
        cleanKey({ function: name, ...doc }),
        source
      );
      Reflect.defineMetadata('app', this.#app, source);
    }

    return source as Promise<T>;
  }
}
