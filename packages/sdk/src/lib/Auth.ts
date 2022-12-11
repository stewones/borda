import { Session } from './types';
import { fetch } from './fetch';
import { EleganteClient } from './Client';
import { InternalHeaders } from './internal';
import { isServer, LocalStorage } from './utils';
export abstract class Auth {
  public static signIn(
    email: string,
    password: string,
    options?: {
      /**
       * modify returned user object
       */
      include?: string[];
      exclude?: string[];
      projection?: Record<string, number>;
    }
  ): Promise<Session> {
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
      const { token } = session;
      if (token) {
        LocalStorage.set(
          `${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiToken']}`,
          token
        );
      }
      return session;
    });
  }

  public static signUp(
    name: string,
    email: string,
    password: string
  ): Promise<Session> {
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
        doc: {
          name,
          email,
          password,
        },
      },
    }).then((session) => {
      const { token } = session;
      if (token && !isServer()) {
        LocalStorage.set(
          `${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiToken']}`,
          token
        );
      }
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

  public static become(token: string) {
    const headers = {
      [`${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiKey']}`]:
        EleganteClient.params.apiKey,
      [`${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiToken']}`]:
        token,
    };

    return fetch<Session>(`${EleganteClient.params.serverURL}/me`, {
      method: 'GET',
      headers,
    }).then((session) => {
      const { token } = session;
      if (token) {
        LocalStorage.set(
          `${EleganteClient.params.serverHeaderPrefix}-${InternalHeaders['apiToken']}`,
          token
        );
      }
      return session;
    });
  }
}
