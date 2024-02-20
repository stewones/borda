import { BordaServerAdditionalHeaders } from './Borda';
import { fetcher } from './fetcher';
import { InternalHeaders } from './internal';
import { BordaLiveQueryMemo } from './query';
import { Session } from './types';
import {
  isBoolean,
  isServer,
  LocalStorage,
} from './utils';
import { slugfy } from './utils/slugfy';

export interface SignOptions {
  /**
   * modify returned user object
   */
  include?: string[];
  exclude?: string[];
  projection?: Record<string, number>;
  /**
   * whether to validate the session with the server
   */
  validateSession?: boolean;
}

export class Auth {
  #name!: string;
  #serverKey!: string;
  #serverSecret!: string;
  #serverURL!: string;
  #serverHeaderPrefix!: string;
  #serverAdditionalHeaders!: BordaServerAdditionalHeaders;
  #sessionToken: string | null = null;

  get sessionToken() {
    return this.#sessionToken;
  }

  constructor({
    name,
    serverKey,
    serverSecret,
    serverURL,
    serverHeaderPrefix,
    serverAdditionalHeaders,
  }: {
    name: string;
    serverKey: string;
    serverSecret: string;
    serverURL: string;
    serverHeaderPrefix: string;
    serverAdditionalHeaders?: BordaServerAdditionalHeaders;
  }) {
    this.#name = name;
    this.#serverKey = serverKey;
    this.#serverSecret = serverSecret;
    this.#serverURL = serverURL;
    this.#serverHeaderPrefix = serverHeaderPrefix;
    this.#serverAdditionalHeaders = serverAdditionalHeaders ?? {};
  }

  #saveSessionToken(token: string) {
    this.#sessionToken = token;
  }

  public getHeaders({ method, token }: { method?: string; token?: string | null }) {
    const headers = {
      [`${this.#serverHeaderPrefix}-${InternalHeaders['apiKey']}`]:
        this.#serverKey,
      ...(typeof this.#serverAdditionalHeaders === 'function'
        ? this.#serverAdditionalHeaders()
        : this.#serverAdditionalHeaders),
    };

    if (token) {
      headers[`${this.#serverHeaderPrefix}-${InternalHeaders['apiToken']}`] =
        token;
    }

    if (method) {
      headers[`${this.#serverHeaderPrefix}-${InternalHeaders['apiMethod']}`] =
        method;
    }

    return headers;
  }

 
  public removeToken() {
    this.#sessionToken = null;
    if (!isServer()) {
      const bordaStorageName = slugfy(this.#name);
      const bordaStorage = LocalStorage.get(bordaStorageName) || {};
      delete bordaStorage.sessionToken;
      LocalStorage.set(bordaStorageName, bordaStorage);
    }
  }

  async signIn(
    { email, password }: { email: string; password: string },
    options?: Pick<SignOptions, 'include' | 'exclude' | 'projection'>
  ) {
    const headers = this.getHeaders({
      method: 'signIn',
    });

    const data = await fetcher<Session>(`${this.#serverURL}/User`, {
      method: 'POST',
      headers,
      body: {
        ...options,
        doc: {
          email,
          password,
        },
      },
      direct: true,
    });

    this.#saveSessionToken(data.token);
    return data;
  }

  async signUp(
    from: {
      name: string;
      email: string;
      password: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [key: string]: any;
    },
    options?: Pick<SignOptions, 'include' | 'exclude' | 'projection'>
  ) {
    const headers = this.getHeaders({
      method: 'signUp',
    });

    if (isServer()) {
      if (this.#serverSecret) {
        headers[`${this.#serverHeaderPrefix}-${InternalHeaders['apiSecret']}`] =
          this.#serverSecret;
      }
    }

    const data = await fetcher<Session>(`${this.#serverURL}/User`, {
      method: 'POST',
      headers,
      body: {
        doc: from,
        options,
      },
      direct: true,
    });

    this.#saveSessionToken(data.token);

    return data;
  }

  async signOut({ token }: { token?: string | null } = {}) {
    if (!token) {
      token = this.sessionToken;
    }

    if (isServer() && !token) {
      throw new Error('token is required on server');
    }

    this.removeToken();

    const headers = this.getHeaders({
      token,
    });

    if (!isServer()) {
      if (BordaLiveQueryMemo.size) {
        for (const [key, value] of BordaLiveQueryMemo) {
          console.debug('closing live query', key); // @todo inject inspect
          value.close();
        }
      }
    }

    return fetcher(`${this.#serverURL}/me`, {
      method: 'DELETE',
      headers,
      direct: true,
    });
  }

  async become({
    token,
    validateSession,
  }: Pick<SignOptions, 'validateSession'> & { token: string }) {
    if (isServer()) {
      throw new Error('become is not supported on server.');
    }

    const headers = this.getHeaders({
      token,
    });

    const shouldValidate = isBoolean(validateSession) ? validateSession : true;

    if (!shouldValidate) {
      this.#saveSessionToken(token);
      return;
    }

    const data = await fetcher<Session>(`${this.#serverURL}/me`, {
      method: 'GET',
      headers,
      direct: true,
    });

    this.#saveSessionToken(token);
    return data;
  }

  async updateEmail({
    currentPassword,
    newEmail,
  }: {
    currentPassword: string;
    newEmail: string;
  }) {
    if (isServer()) {
      throw new Error(
        'email update via Auth SDK is not supported on server. use the `query` api with `unlock` instead.'
      );
    }

    const token = this.sessionToken;

    if (!token) {
      throw new Error(
        `A token is required to update user's email. Did you sign in before?`
      );
    }

    const headers = this.getHeaders({
      method: 'updateEmail',
      token,
    });

    const data = await fetcher<Session>(`${this.#serverURL}/User`, {
      method: 'POST',
      headers,
      body: {
        doc: {
          email: newEmail,
          password: currentPassword,
        },
      },
      direct: true,
    });

    this.#saveSessionToken(data.token);
    return data;
  }

  async updatePassword({
    currentPassword,
    newPassword,
  }: {
    currentPassword: string;
    newPassword: string;
  }) {
    if (isServer()) {
      throw new Error(
        'password update via Auth SDK is not supported on server.'
      );
    }

    const token = this.sessionToken;

    if (!token) {
      throw new Error(
        'A token is required to update user password. Did you `signIn` or `become` before?'
      );
    }

    const headers = this.getHeaders({
      method: 'updatePassword',
      token,
    });

    const data = await fetcher<Session>(`${this.#serverURL}/User`, {
      method: 'POST',
      headers,
      body: {
        doc: {
          currentPassword,
          newPassword,
        },
      },
      direct: true,
    });

    this.#saveSessionToken(data.token);
    return data;
  }

  async forgotPassword({ email }: { email: string }) {
    const headers = this.getHeaders({
      method: 'passwordForgot',
    });

    return fetcher(`${this.#serverURL}/User`, {
      method: 'POST',
      headers,
      body: {
        doc: {
          email,
        },
      },
      direct: true,
    });
  }

  async resetPassword({
    token,
    newPassword,
  }: {
    token: string;
    newPassword: string;
  }) {
    const headers = this.getHeaders({
      method: 'passwordReset',
    });

    return fetcher(`${this.#serverURL}/User`, {
      method: 'POST',
      headers,
      body: {
        doc: {
          token,
          password: newPassword,
        },
      },
      direct: true,
    });
  }
}
