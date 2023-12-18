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
import { isBoolean, isServer, LocalStorage } from './utils';

export interface SignOptions {
  /**
   * modify returned user object
   */
  include?: string[];
  exclude?: string[];
  projection?: Record<string, number>;
  /**
   * whether to save the token to local storage
   */
  saveToken?: boolean;
  /**
   * whether to validate the session with the server
   */
  validateSession?: boolean;
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
    }).then((session) => {
      saveSessionToken(session.token, options ?? {});
      return session;
    });
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

    return fetch<Session>(`${EleganteClient.params.serverURL}/User`, {
      method: 'POST',
      headers,
      body: {
        doc: from,
      },
    }).then((session) => {
      saveSessionToken(session.token, options ?? {});
      return session;
    });
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
    options?: Pick<SignOptions, 'saveToken' | 'validateSession'>
  ) {
    if (isServer()) {
      throw new Error('become is not supported on server.');
    }

    const headers = {
      [`${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiKey']}`]:
        EleganteClient.params.apiKey,
      [`${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiToken']}`]:
        token,
    };

    const shouldValidate = isBoolean(options?.validateSession)
      ? options?.validateSession
      : true;

    return shouldValidate
      ? fetch<Session>(`${EleganteClient.params.serverURL}/me`, {
          method: 'GET',
          headers,
        }).then((session) => {
          saveSessionToken(session.token, options ?? {});
          return session;
        })
      : Promise.resolve().then(() => {
          saveSessionToken(token, options ?? {});
        });
  }

  public static updateEmail(
    password: string,
    newEmail: string,
    options?: SignOptions
  ) {
    if (isServer()) {
      throw new Error(
        'email update via Auth SDK is not supported on server. use the `query` api with `unlock` instead.'
      );
    }

    const headers = {
      [`${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiKey']}`]:
        EleganteClient.params.apiKey,
      [`${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiMethod']}`]:
        'updateEmail',
    };

    const token = LocalStorage.get(
      `${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiToken']}`
    );

    if (!token) {
      throw new Error(
        `A token is required to update user's email. Did you sign in before?`
      );
    }

    headers[
      `${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiToken']}`
    ] = token;

    return fetch<Session>(`${EleganteClient.params.serverURL}/User`, {
      method: 'POST',
      headers,
      body: {
        doc: {
          email: newEmail,
          password: password,
        },
      },
    }).then((session) => {
      saveSessionToken(session.token, options ?? {});
      return session;
    });
  }

  public static updatePassword(
    currentPassword: string,
    newPassword: string,
    options?: SignOptions
  ) {
    if (isServer()) {
      throw new Error(
        'password update via Auth SDK is not supported on server. use the `query` api with `unlock` instead.'
      );
    }

    const headers = {
      [`${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiKey']}`]:
        EleganteClient.params.apiKey,
      [`${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiMethod']}`]:
        'updatePassword',
    };

    const token = LocalStorage.get(
      `${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiToken']}`
    );

    if (!token) {
      throw new Error(
        `A token is required to update user's password. Did you sign in before?`
      );
    }

    headers[
      `${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiToken']}`
    ] = token;

    return fetch<Session>(`${EleganteClient.params.serverURL}/User`, {
      method: 'POST',
      headers,
      body: {
        doc: {
          currentPassword,
          newPassword,
        },
      },
    }).then((session) => {
      saveSessionToken(session.token, options ?? {});
      return session;
    });
  }

  public static forgotPassword(email: string) {
    const headers = {
      [`${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiKey']}`]:
        EleganteClient.params.apiKey,
      [`${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiMethod']}`]:
        'passwordForgot',
    };

    return fetch<void>(`${EleganteClient.params.serverURL}/User`, {
      method: 'POST',
      headers,
      body: {
        doc: {
          email,
        },
      },
    });
  }

  public static resetPassword(token: string, password: string) {
    const headers = {
      [`${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiKey']}`]:
        EleganteClient.params.apiKey,
      [`${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiMethod']}`]:
        'passwordReset',
    };

    return fetch(`${EleganteClient.params.serverURL}/User`, {
      method: 'POST',
      headers,
      body: {
        doc: {
          token,
          password,
        },
      },
    });
  }
}

function saveSessionToken(token: string, options: SignOptions) {
  const persist = options?.saveToken ?? true;

  if (persist && token && !isServer()) {
    LocalStorage.set(
      `${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiToken']}`,
      token
    );
  }
}
