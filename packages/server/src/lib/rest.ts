/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

import express, { Application } from 'express';

import { ServerParams } from './Server';
import { restDelete } from './restDelete';
import { restDeleteMe } from './restDeleteMe';
import { restGet } from './restGet';
import { restGetMe } from './restGetMe';
import { restPost } from './restPost';
import { restPut } from './restPut';

import {
  routeEnsureApiKey,
  routeUnlock,
  routeEnsureApiSecret,
  routeEnsureAuth,
} from './route';

export function rest({
  app,
  params,
}: {
  app: Application;
  params: ServerParams;
}) {
  app.use(express.json({ limit: '1mb' }));
  app.use(
    express.urlencoded({
      extended: true,
      limit: '1mb',
    })
  );

  app.all(
    '/*',
    routeEnsureApiKey({
      params,
    }),
    routeUnlock({
      params,
    })
  );

  app.all(
    '/jobs/*',
    routeEnsureApiSecret({
      params,
    })
  );

  app.get('/ping', (req, res) => res.send('🏓')); // for external ping services or whatever

  /**
   * setup rest routes
   */

  app.post(
    '/:collectionName',
    routeEnsureAuth({
      params,
    }),
    restPost({
      params,
    })
  );

  app.put(
    '/:collectionName/:objectId',
    routeEnsureAuth({
      params,
    }),
    restPut({
      params,
    })
  );

  app.delete(
    '/:collectionName/:objectId',
    routeEnsureAuth({
      params,
    }),
    restDelete({
      params,
    })
  );

  app.get(
    '/:collectionName/:objectId',
    routeEnsureAuth({
      params,
    }),
    restGet({
      params,
    })
  );

  app.get(
    '/me',
    routeEnsureAuth({
      params,
    }),
    restGetMe({
      params,
    })
  );

  app.delete(
    '/me',
    routeEnsureAuth({
      params,
    }),
    restDeleteMe({
      params,
    })
  );
}
