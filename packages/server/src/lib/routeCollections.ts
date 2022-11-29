import { Application } from 'express';
import { ServerParams } from './createServer';
import { routeCollectionsGet } from './routeCollectionsGet';
import { routeCollectionsPost } from './routeCollectionsPost';

export function routeCollections({
  app,
  params,
}: {
  app: Application;
  params: ServerParams;
}) {
  /**
   * @todo
   * only logged users can access the Collections API via REST
   * we need to also implement beforeFind, beforeInsert, beforeUpdate, beforeDelete
   * also we need to implement afterFind, afterInsert, afterUpdate, afterDelete
   * attaching the user in session to the request plus the query being made
   * this way users can easily implement their permission system
   */
  // app.all('*', handleUserSession)

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
