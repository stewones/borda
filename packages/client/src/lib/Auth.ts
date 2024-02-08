import { fetcher } from './fetcher';
import { InternalHeaders, memo } from './internal';
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

export class Auth {
  #serverKey!: string;
  #serverSecret!: string;
  #serverURL!: string;
  #serverHeaderPrefix!: string;

  constructor({
    serverKey,
    serverSecret,
    serverURL,
    serverHeaderPrefix,
  }: {
    serverKey: string;
    serverSecret: string;
    serverURL: string;
    serverHeaderPrefix: string;
  }) {
    this.#serverKey = serverKey;
    this.#serverSecret = serverSecret;
    this.#serverURL = serverURL;
    this.#serverHeaderPrefix = serverHeaderPrefix;
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

  signIn(email: string, password: string, options?: SignOptions) {
    const headers = {
      [`${this.#serverHeaderPrefix}-${InternalHeaders['apiKey']}`]:
        this.#serverKey,
      [`${this.#serverHeaderPrefix}-${InternalHeaders['apiMethod']}`]: 'signIn',
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

  async signOut(token?: string) {
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
    };

    if (token) {
      headers[`${this.#serverHeaderPrefix}-${InternalHeaders['apiToken']}`] =
        token;
    }

    return fetcher(`${this.#serverURL}/me`, {
      method: 'DELETE',
      headers,
      direct: true,
    }).then(() => {
      if (!isServer()) {
        LocalStorage.unset(
          `${this.#serverHeaderPrefix}-${InternalHeaders['apiToken']}`
        );

        // @todo move to a better place
        if (memo.size) {
          for (const [key, value] of memo) {
            if (key.startsWith('livequery:')) {
              value.close();
            }
          }
        }
      }
    });
  }

  async become(
    token: string,
    options?: Pick<SignOptions, 'saveToken' | 'validateSession'>
  ) {
    if (isServer()) {
      throw new Error('become is not supported on server.');
    }

    const headers = {
      [`${this.#serverHeaderPrefix}-${InternalHeaders['apiKey']}`]:
        this.#serverKey,
      [`${this.#serverHeaderPrefix}-${InternalHeaders['apiToken']}`]: token,
    };

    const shouldValidate = isBoolean(options?.validateSession)
      ? options?.validateSession
      : true;

    return shouldValidate
      ? fetcher<Session>(`${this.#serverURL}/me`, {
          method: 'GET',
          headers,
          direct: true,
        }).then((data) => {
          this.#saveSessionToken(data.token, options ?? {});
          return data;
        })
      : Promise.resolve().then(() => {
          this.#saveSessionToken(token, options ?? {});
        });
  }

  async updateEmail(password: string, newEmail: string, options?: SignOptions) {
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
          password: password,
        },
      },
      direct: true,
    }).then((data) => {
      this.#saveSessionToken(data.token, options ?? {});
      return data;
    });
  }

  async updatePassword(
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
      [`${this.#serverHeaderPrefix}-${InternalHeaders['apiKey']}`]:
        this.#serverKey,
      [`${this.#serverHeaderPrefix}-${InternalHeaders['apiMethod']}`]:
        'updatePassword',
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

  async forgotPassword(email: string) {
    const headers = {
      [`${this.#serverHeaderPrefix}-${InternalHeaders['apiKey']}`]:
        this.#serverKey,
      [`${this.#serverHeaderPrefix}-${InternalHeaders['apiMethod']}`]:
        'passwordForgot',
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

  async resetPassword(token: string, password: string) {
    const headers = {
      [`${this.#serverHeaderPrefix}-${InternalHeaders['apiKey']}`]:
        this.#serverKey,
      [`${this.#serverHeaderPrefix}-${InternalHeaders['apiMethod']}`]:
        'passwordReset',
    };

    return fetcher(`${this.#serverURL}/User`, {
      method: 'POST',
      headers,
      body: {
        doc: {
          token,
          password,
        },
      },
      direct: true,
    });
  }
}
