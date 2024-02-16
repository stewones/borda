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

export class Auth {
  #serverKey!: string;
  #serverSecret!: string;
  #serverURL!: string;
  #serverHeaderPrefix!: string;
  #serverAdditionalHeaders!: BordaServerAdditionalHeaders;

  constructor({
    serverKey,
    serverSecret,
    serverURL,
    serverHeaderPrefix,
    serverAdditionalHeaders,
  }: {
    serverKey: string;
    serverSecret: string;
    serverURL: string;
    serverHeaderPrefix: string;
    serverAdditionalHeaders?: BordaServerAdditionalHeaders;
  }) {
    this.#serverKey = serverKey;
    this.#serverSecret = serverSecret;
    this.#serverURL = serverURL;
    this.#serverHeaderPrefix = serverHeaderPrefix;
    this.#serverAdditionalHeaders = serverAdditionalHeaders ?? {};
  }

  #saveSessionToken(token: string, options: SignOptions) {
    const persist = options?.saveToken ?? true;

    if (persist && token && !isServer()) {
      LocalStorage.set(
        `${this.#serverHeaderPrefix}-${InternalHeaders['apiToken']}`,
        token
      );
    }
  }

  signIn(
    { email, password }: { email: string; password: string },
    options?: SignOptions
  ) {
    const headers = {
      [`${this.#serverHeaderPrefix}-${InternalHeaders['apiKey']}`]:
        this.#serverKey,
      [`${this.#serverHeaderPrefix}-${InternalHeaders['apiMethod']}`]: 'signIn',
      ...(typeof this.#serverAdditionalHeaders === 'function'
        ? this.#serverAdditionalHeaders()
        : this.#serverAdditionalHeaders),
    };

    return fetcher<Session>(`${this.#serverURL}/User`, {
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
    }).then((data) => {
      this.#saveSessionToken(data.token, options ?? {});
      return data;
    });
  }

  async signUp(
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
      [`${this.#serverHeaderPrefix}-${InternalHeaders['apiKey']}`]:
        this.#serverKey,
      [`${this.#serverHeaderPrefix}-${InternalHeaders['apiMethod']}`]: 'signUp',
      ...(typeof this.#serverAdditionalHeaders === 'function'
        ? this.#serverAdditionalHeaders()
        : this.#serverAdditionalHeaders),
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

    const data = await fetcher<Session>(`${this.#serverURL}/User`, {
      method: 'POST',
      headers,
      body: {
        doc: from,
      },
      direct: true,
    });
    this.#saveSessionToken(data.token, options ?? {});
    return data;
  }

  async signOut({ token }: { token?: string } = {}) {
    if (!isServer()) {
      token = LocalStorage.get(
        `${this.#serverHeaderPrefix}-${InternalHeaders['apiToken']}`
      );
    }

    if (isServer() && !token) {
      throw new Error('token is required on server');
    }

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

    return fetcher(`${this.#serverURL}/me`, {
      method: 'DELETE',
      headers,
      direct: true,
    }).finally(() => {
      if (!isServer()) {
        LocalStorage.unset(
          `${this.#serverHeaderPrefix}-${InternalHeaders['apiToken']}`
        );
        if (BordaLiveQueryMemo.size) {
          for (const [key, value] of BordaLiveQueryMemo) {
            console.log('closing live query', key);
            value.close();
          }
        }
      }
    });
  }

  async become({
    token,
    saveToken,
    validateSession,
  }: Pick<SignOptions, 'saveToken' | 'validateSession'> & { token: string }) {
    if (isServer()) {
      throw new Error('become is not supported on server.');
    }

    const headers = {
      [`${this.#serverHeaderPrefix}-${InternalHeaders['apiKey']}`]:
        this.#serverKey,
      [`${this.#serverHeaderPrefix}-${InternalHeaders['apiToken']}`]: token,
      ...(typeof this.#serverAdditionalHeaders === 'function'
        ? this.#serverAdditionalHeaders()
        : this.#serverAdditionalHeaders),
    };

    const shouldValidate = isBoolean(validateSession) ? validateSession : true;

    return shouldValidate
      ? fetcher<Session>(`${this.#serverURL}/me`, {
          method: 'GET',
          headers,
          direct: true,
        }).then((data) => {
          this.#saveSessionToken(data.token, {
            saveToken,
            validateSession,
          });
          return data;
        })
      : Promise.resolve().then(() => {
          this.#saveSessionToken(token, {
            saveToken,
            validateSession,
          });
        });
  }

  async updateEmail(
    {
      currentPassword,
      newEmail,
    }: { currentPassword: string; newEmail: string },
    options?: SignOptions
  ) {
    if (isServer()) {
      throw new Error(
        'email update via Auth SDK is not supported on server. use the `query` api with `unlock` instead.'
      );
    }

    const headers = {
      [`${this.#serverHeaderPrefix}-${InternalHeaders['apiKey']}`]:
        this.#serverKey,
      [`${this.#serverHeaderPrefix}-${InternalHeaders['apiMethod']}`]:
        'updateEmail',
      ...(typeof this.#serverAdditionalHeaders === 'function'
        ? this.#serverAdditionalHeaders()
        : this.#serverAdditionalHeaders),
    };

    const token = LocalStorage.get(
      `${this.#serverHeaderPrefix}-${InternalHeaders['apiToken']}`
    );

    if (!token) {
      throw new Error(
        `A token is required to update user's email. Did you sign in before?`
      );
    }

    headers[`${this.#serverHeaderPrefix}-${InternalHeaders['apiToken']}`] =
      token;

    return fetcher<Session>(`${this.#serverURL}/User`, {
      method: 'POST',
      headers,
      body: {
        doc: {
          email: newEmail,
          password: currentPassword,
        },
      },
      direct: true,
    }).then((data) => {
      this.#saveSessionToken(data.token, options ?? {});
      return data;
    });
  }

  async updatePassword(
    {
      currentPassword,
      newPassword,
    }: { currentPassword: string; newPassword: string },

    options?: SignOptions
  ) {
    if (isServer()) {
      throw new Error(
        'password update via Auth SDK is not supported on server. use the `query` api with `unlock` instead.'
      );
    }

    const headers = {
      [`${this.#serverHeaderPrefix}-${InternalHeaders['apiKey']}`]:
        this.#serverKey,
      [`${this.#serverHeaderPrefix}-${InternalHeaders['apiMethod']}`]:
        'updatePassword',
      ...(typeof this.#serverAdditionalHeaders === 'function'
        ? this.#serverAdditionalHeaders()
        : this.#serverAdditionalHeaders),
    };

    const token = LocalStorage.get(
      `${this.#serverHeaderPrefix}-${InternalHeaders['apiToken']}`
    );

    if (!token) {
      throw new Error(
        `A token is required to update user's password. Did you sign in before?`
      );
    }

    headers[`${this.#serverHeaderPrefix}-${InternalHeaders['apiToken']}`] =
      token;

    return fetcher<Session>(`${this.#serverURL}/User`, {
      method: 'POST',
      headers,
      body: {
        doc: {
          currentPassword,
          newPassword,
        },
      },
      direct: true,
    }).then((data) => {
      this.#saveSessionToken(data.token, options ?? {});
      return data;
    });
  }

  async forgotPassword({ email }: { email: string }) {
    const headers = {
      [`${this.#serverHeaderPrefix}-${InternalHeaders['apiKey']}`]:
        this.#serverKey,
      [`${this.#serverHeaderPrefix}-${InternalHeaders['apiMethod']}`]:
        'passwordForgot',
      ...(typeof this.#serverAdditionalHeaders === 'function'
        ? this.#serverAdditionalHeaders()
        : this.#serverAdditionalHeaders),
    };

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
    const headers = {
      [`${this.#serverHeaderPrefix}-${InternalHeaders['apiKey']}`]:
        this.#serverKey,
      [`${this.#serverHeaderPrefix}-${InternalHeaders['apiMethod']}`]:
        'passwordReset',
      ...(typeof this.#serverAdditionalHeaders === 'function'
        ? this.#serverAdditionalHeaders()
        : this.#serverAdditionalHeaders),
    };

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
