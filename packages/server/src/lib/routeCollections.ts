import express, { Application } from 'express';

import { EleganteServerParams } from './createServer';
import { routeCollectionsGet } from './routeCollectionsGet';
import { routeCollectionsPost } from './routeCollectionsPost';

export function routeCollections({
  app,
  params,
}: {
  app: Application;
  params: EleganteServerParams;
}) {
  /**
   * configure express
   */
  app.use(
    '/collections',
    express.urlencoded({
      extended: true,
      limit: '1mb',
    })
  );
  app.use('/collections', express.json({ limit: '1mb' }));

  /**
   * setup rest routes
   */
  app.post(
    '/collections/:collectionName',
    routeCollectionsPost({
      params,
    })
  );
  app.get(
    '/collections/:collectionName/:objectId',
    routeCollectionsGet({
      params,
    })
  );
}
