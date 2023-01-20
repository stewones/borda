/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */
import { EleganteClient } from './Client';
import { fetch } from './fetch';
import { InternalHeaders } from './internal';
import { Session } from './types';
import {
  isServer,
  LocalStorage,
} from './utils';

interface SignOptions {
  /**
   * modify returned user object
   */
  include?: string[];
  exclude?: string[];
  projection?: Record<string, number>;
  /**
   * extra
   */
  saveToken?: boolean;
}

export abstract class Auth {
  public static signIn(email: string, password: string, options?: SignOptions) {
    const headers = {
      [`${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiKey']}`]:
        EleganteClient.params.apiKey,
      [`${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiMethod']}`]:
        'signIn',
    };

    return fetch<Session>(`${EleganteClient.params.serverURL}/User`, {
      method: 'POST',
      headers,
      body: {
        ...options,
        doc: {
          email,
          password,
        },
      },
    }).then((session) => saveSessionToken(session, options ?? {}));
  }

  public static signUp(
    from: {
      name: string;
      email: string;
      password: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [key: string]: any;
    },
    options?: SignOptions
  ) {
    const headers = {
      [`${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiKey']}`]:
        EleganteClient.params.apiKey,
      [`${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiMethod']}`]:
        'signUp',
    };

    return fetch<Session>(`${EleganteClient.params.serverURL}/User`, {
      method: 'POST',
      headers,
      body: {
        doc: from,
      },
    }).then((session) => saveSessionToken(session, options ?? {}));
  }

  public static signOut(token?: string) {
    if (!isServer()) {
      token = LocalStorage.get(
        `${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiToken']}`
      );
    }

    if (isServer() && !token) {
      throw new Error('token is required on server');
    }

    const headers = {
      [`${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiKey']}`]:
        EleganteClient.params.apiKey,
    };

    if (token) {
      headers[
        `${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiToken']}`
      ] = token;
    }

    return fetch(`${EleganteClient.params.serverURL}/me`, {
      method: 'DELETE',
      headers,
    }).then(() => {
      if (!isServer()) {
        LocalStorage.unset(
          `${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiToken']}`
        );
      }
    });
  }

  public static become(
    token: string,
    options?: Pick<SignOptions, 'saveToken'>
  ) {
    const headers = {
      [`${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiKey']}`]:
        EleganteClient.params.apiKey,
      [`${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiToken']}`]:
        token,
    };

    return fetch<Session>(`${EleganteClient.params.serverURL}/me`, {
      method: 'GET',
      headers,
    }).then((session) => saveSessionToken(session, options ?? {}));
  }

  public static updateEmail(
    newEmail: string,
    password: string,
    options?: SignOptions
  ) {
    let token = null;

    const headers = {
      [`${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiKey']}`]:
        EleganteClient.params.apiKey,
      [`${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiMethod']}`]:
        'updateEmail',
    };

    if (!isServer()) {
      token = LocalStorage.get(
        `${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiToken']}`
      );
    }

    if (token) {
      headers[
        `${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiToken']}`
      ] = token;
    }

    if (!isServer() && !token) {
      throw new Error('token is required on client. did you sign in before?');
    }

    if (isServer() && EleganteClient.params.apiSecret) {
      headers[
        `${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiSecret']}`
      ] = EleganteClient.params.apiSecret;
    }

    return fetch<Session>(`${EleganteClient.params.serverURL}/User`, {
      method: 'POST',
      headers,
      body: {
        doc: {
          email: newEmail,
          password: password,
        },
      },
    }).then((session) => saveSessionToken(session, options ?? {}));
  }
}

function saveSessionToken(session: Session, options: SignOptions) {
  const { token } = session;
  const persist = options?.saveToken ?? true;

  if (persist && token && !isServer()) {
    LocalStorage.set(
      `${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiToken']}`,
      token
    );
  }
  return session;
}
