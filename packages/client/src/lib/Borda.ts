/* eslint-disable @typescript-eslint/no-explicit-any */

import { Auth } from './Auth';
import { Cloud } from './Cloud';
import { BordaError, ErrorCode } from './Error';
import { InternalHeaders } from './internal';
import { BordaClientQuery } from './query';
import { isServer } from './utils';

export interface BordaParams {
  name?: string;
  inspect?: boolean;
  serverKey?: string;
  serverSecret?: string;
  serverURL?: string;
  serverHeaderPrefix?: string;
}
export class Borda {
  #name!: string;
  #inspect!: boolean;

  #cloud!: Cloud;
  #auth!: Auth;

  #serverKey!: string;
  #serverSecret!: string;
  #serverURL!: string;
  #serverHeaderPrefix!: string;

  get cloud() {
    return this.#cloud;
  }

  get name() {
    return this.#name;
  }

  get inspect() {
    return this.#inspect;
  }

  get serverKey() {
    return this.#serverKey;
  }

  get serverSecret() {
    return this.#serverSecret;
  }

  get serverURL() {
    return this.#serverURL;
  }

  get serverHeaderPrefix() {
    return this.#serverHeaderPrefix;
  }

  get auth() {
    return this.#auth;
  }

  constructor(params?: Partial<BordaParams>) {
    const {
      name,
      inspect,
      serverKey,
      serverSecret,
      serverURL,
      serverHeaderPrefix,
    } = params || {};

    if (!isServer() && serverSecret) {
      throw new BordaError(
        ErrorCode.SERVER_SECRET_EXPOSED,
        `serverSecret can't be exposed on client side`
      );
    }

    // set default params
    this.#inspect = inspect || false;
    this.#name = name || 'main-borda';
    this.#serverKey =
      serverKey || process.env['BORDA_SERVER_KEY'] || 'b-o-r-d-a';
    this.#serverSecret =
      serverSecret || process.env['BORDA_SERVER_SECRET'] || 's-e-c-r-e-t';
    this.#serverURL =
      serverURL || process.env['BORDA_SERVER_URL'] || 'http://127.0.0.1:1337';
    this.#serverHeaderPrefix =
      serverHeaderPrefix ||
      process.env['BORDA_SERVER_HEADER_PREFIX'] ||
      'X-Borda';

    // instantiate cloud
    this.#cloud = new Cloud({
      serverKey: this.#serverKey,
      serverSecret: this.#serverSecret,
      serverURL: this.#serverURL,
      serverHeaderPrefix: this.#serverHeaderPrefix,
    });

    // instantiate auth
    this.#auth = new Auth({
      serverKey: this.#serverKey,
      serverSecret: this.#serverSecret,
      serverURL: this.#serverURL,
      serverHeaderPrefix: this.#serverHeaderPrefix,
    });
  }

  ping() {
    return fetch(`${this.#serverURL}/ping`, {
      headers: {
        'Content-Type': 'text/html',
        [`${this.#serverHeaderPrefix}-${InternalHeaders['apiKey']}`]:
          this.#serverKey,
      },
    }).then((res) => res.text());
  }

  query<TSchema extends Document = Document>(collection: string) {
    return new BordaClientQuery<TSchema>({
      collection,
      inspect: this.inspect,
      serverURL: this.serverURL,
      serverKey: this.serverKey,
      serverSecret: this.serverSecret,
      serverHeaderPrefix: this.serverHeaderPrefix,
    });
  }
}

export const BordaClient = Borda;