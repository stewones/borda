import { Application } from 'express';
import { ServerParams } from './ElegServer';
import { restGet } from './restGet';
import { restPost } from './restPost';

export function rest({
  app,
  params,
}: {
  app: Application;
  params: ServerParams;
}) {
  /**
   * @todo
   * only logged users can access the API via REST
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
    '/:collectionName',
    restPost({
      params,
    })
  );

  /**
   * @todo
   * define api
   */
  app.get(
    '/:collectionName/:objectId',
    restGet({
      params,
    })
  );
}
