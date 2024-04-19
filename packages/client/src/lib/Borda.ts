/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { Auth } from './Auth';
import { Cloud } from './Cloud';
import {
  BordaError,
  ErrorCode,
} from './Error';
import { InternalHeaders } from './internal';
import { BordaClientQuery } from './query';
import { Document } from './types';
import { isServer } from './utils';

export interface BordaParams {
  name?: string;
  inspect?: boolean;
  serverKey?: string;
  serverSecret?: string;
  serverURL?: string;
  serverHeaderPrefix?: string;
  serverAdditionalHeaders?: BordaServerAdditionalHeaders;
}

export type BordaServerAdditionalHeaders =
  | Record<string, any>
  | (() => Record<string, any>);

export class Borda {
  #name!: string;
  #inspect!: boolean;

  #cloud!: Cloud;
  #auth!: Auth;

  #serverKey!: string;
  #serverSecret!: string;
  #serverURL!: string;
  #serverHeaderPrefix!: string;
  #serverAdditionalHeaders!: BordaServerAdditionalHeaders;

  static pubsub: Record<string, { handler: Function; id: string }[]> = {};

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

  get serverURL() {
    return this.#serverURL;
  }

  get serverHeaderPrefix() {
    return this.#serverHeaderPrefix;
  }

  get serverAdditionalHeaders() {
    return this.#serverAdditionalHeaders;
  }

  get auth() {
    return this.#auth;
  }

  get serverSecret() {
    return this.#serverSecret;
  }

  set serverSecret(secret: string) {
    this.#serverSecret = secret;
  }

  constructor(params?: Partial<BordaParams>) {
    const {
      name,
      inspect,
      serverKey,
      serverSecret,
      serverURL,
      serverHeaderPrefix,
      serverAdditionalHeaders,
    } = params || {};

    if (!isServer() && serverSecret) {
      throw new BordaError(
        ErrorCode.SERVER_SECRET_EXPOSED,
        `serverSecret can't be exposed on client side`
      );
    }

    // set default params
    this.#inspect = inspect || false;
    this.#name = name || 'my-borda';
    this.#serverKey = serverKey || 'b-o-r-d-a';
    this.#serverSecret = serverSecret || 's-e-c-r-e-t';
    this.#serverURL = serverURL || 'http://127.0.0.1:1337';
    this.#serverHeaderPrefix = serverHeaderPrefix || 'X-Borda';
    this.#serverAdditionalHeaders = serverAdditionalHeaders || {};

    // instantiate auth
    this.#auth = new Auth({
      name: this.#name,
      serverKey: this.#serverKey,
      serverSecret: this.#serverSecret,
      serverURL: this.#serverURL,
      serverHeaderPrefix: this.#serverHeaderPrefix,
      serverAdditionalHeaders: this.#serverAdditionalHeaders,
    });

    // instantiate cloud
    this.#cloud = new Cloud({
      app: this.#name,
      auth: this.#auth,
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

  query<TSchema = Document>(collection: string) {
    return new BordaClientQuery<TSchema>({
      collection,
      app: this.#name,
      auth: this.#auth,
      inspect: this.inspect,
      serverURL: this.serverURL,
      serverKey: this.serverKey,
      serverSecret: this.serverSecret,
      serverHeaderPrefix: this.serverHeaderPrefix,
    });
  }
}

export const BordaClient = Borda;
