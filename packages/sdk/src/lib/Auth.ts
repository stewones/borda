import { User, Session } from './types';
import { fetch } from './fetch';
import { EleganteClient } from './EleganteClient';
import { InternalHeaders } from './internal';

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
        email,
        password,
        ...options,
      },
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
        name,
        email,
        password,
      },
    });
  }
}
