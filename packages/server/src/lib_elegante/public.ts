/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import express, { Application } from 'express';

import {
  DefaultEmailPasswordResetTemplate,
  DefaultEmailProvider,
  init,
  InternalHeaders,
  log,
  pointer,
  print,
  query,
  Session,
  User,
} from '@elegante/sdk';

import { newToken } from '../utils';
import { Cache } from './Cache';
import {
  createLiveQueryServer as CLQS,
  ServerEvents as SE,
} from './LiveQueryServer';
import { rest } from './rest';
import {
  createIndexes,
  EleganteServer,
  mongoConnect,
  ServerParams,
} from './Server';
import { Version } from './Version';

// @todo move somewhere else
export function createEleganteServer(
  options: Partial<ServerParams>
): Application {
  const app = (EleganteServer.app = express());

  EleganteServer.params = { ...EleganteServer.params, ...options };
  const { params } = EleganteServer;

  /**
   * set default plugins
   */
  const emailPasswordResetTemplate = params.plugins?.find(
    (it) => it['EmailPasswordResetTemplate' as keyof typeof it]
  );

  const emailProviderPlugin = params.plugins?.find(
    (it) => it['EmailProvider' as keyof typeof it]
  );

  if (!emailProviderPlugin) {
    params.plugins = [
      ...(params.plugins ?? []),
      {
        name: 'EmailProvider',
        version: '0.0.0',
        EmailProvider() {
          // implement your own email provider
          // follow the interface defined in the DefaultEmailProvider
          return DefaultEmailProvider();
        },
      },
    ];
  }

  if (!emailPasswordResetTemplate) {
    params.plugins = [
      ...(params.plugins ?? []),
      {
        name: 'EmailPasswordResetTemplate',
        version: '0.0.0',
        EmailPasswordResetTemplate({ token, user, baseUrl }) {
          return DefaultEmailPasswordResetTemplate({ token, user, baseUrl });
        },
      },
    ];
  }

  init(params);
  rest({
    app,
    params,
  });

  mongoConnect({ params })
    .then((db) => {
      try {
        EleganteServer.db = db;
        createIndexes({ db, params });
        SE.onDatabaseConnect.next({ db });
      } catch (err) {
        print(err);
      }
    })
    .catch((err) => log(err));

  print(`Elegante Server v${Version}`);

  if (params.documentCacheTTL && params.documentCacheTTL <= 0) {
    Cache.disable();
    print('❗ Document cache has been disabled.');
    print(
      '❗ Be sure to set documentCacheTTL to a positive number in production to boost queries performance.'
    );
  }

  Cache.clock();

  return app;
}

// @todo move somewhere else
export async function createSessionOld<T = Session>(user: User) {
  /**
   * because we don't want to expose the user password
   */
  delete user.password;

  /**
   * expires in 1 year
   * @todo make this an option ?
   */
  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  /**
   * generate a new session token
   */
  const token = `e:${newToken()}`;
  const session = await query('Session')
    .unlock()
    .insert({
      user: pointer('User', user.objectId),
      token,
      expiresAt: expiresAt.toISOString(),
    });

  return { ...session, user } as T;
}

// @todo move somewhere else
export function prefixedServerHeaders() {
  const headers = [];
  for (const k in InternalHeaders) {
    headers.push(
      `${EleganteServer.params.serverHeaderPrefix}-${
        InternalHeaders[k as keyof typeof InternalHeaders]
      }`
    );
  }
  return headers;
}

export const createLiveQueryServer = CLQS;
export const ServerEvents = SE;
