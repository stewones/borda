import { Db } from 'mongodb';

/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  BordaError,
  ErrorCode,
  ExternalCollectionName,
  InternalCollectionName,
  InternalHeaders,
  QueryMethod,
} from '@borda/sdk';

import { BordaQuery } from './Borda';
import { Cache } from './Cache';
import { find, get, put } from './operation';
import { DocQRLFrom, parseQuery } from './parse';

export function restPost({
  params,
  request,
  body,
  db,
  query,
  cache,
  serverHeaderPrefix,
}: {
  params: any;
  request: Request & any;
  body: any;
  db: Db;
  query: (collection: string) => BordaQuery;
  cache: Cache;
  serverHeaderPrefix: string;
}) {
  try {
    const inspect = request.inspect;
    const unlocked = request.unlocked;

    const collectionName =
      InternalCollectionName[params['collectionName']] ??
      params['collectionName'];

    const method = request.headers.get(
      `${serverHeaderPrefix}-${InternalHeaders['apiMethod']}`
    ) as QueryMethod;

    if (!method) {
      return Promise.reject(
        new BordaError(
          ErrorCode.REST_METHOD_REQUIRED,
          'Method required'
        ).toJSON()
      );
    }

    /**
     * query against to any of the reserved collections
     * if not unlocked should be strictly forbidden
     */
    const reservedCollections = [
      ...Object.keys(InternalCollectionName),
      ...Object.keys(ExternalCollectionName),
    ];

    if (
      ![
        'signIn',
        'signUp',
        'updateEmail',
        'updatePassword',
        'passwordForgot',
        'passwordReset',
      ].includes(method) &&
      !unlocked &&
      reservedCollections.includes(collectionName)
    ) {
      return Promise.reject(
        new BordaError(
          ErrorCode.QUERY_NOT_ALLOWED,
          `You can't execute the operation '${method}' on '${
            ExternalCollectionName[collectionName] ?? collectionName
          }' because it's a reserved collection`
        ).toJSON()
      );
    }

    const docQRLFrom: DocQRLFrom = {
      ...body,
      method,
      collection: collectionName,
    };

    const docQRL = parseQuery({
      from: docQRLFrom,
      db,
      inspect,
    });

    if (['find', 'findOne'].includes(method)) {
      return find({
        docQRL,
        method,
        inspect,
        unlocked,
        cache,
        query,
      });
    }

    if (method === 'update') {
      // return restPostUpdate({
      //   req,
      //   res,
      //   docQRL,
      // });
    } else if (method === 'updateMany') {
      // return restPostUpdateMany({
      //   res,
      //   docQRL,
      // });
    } else if (method === 'remove') {
      // return restPostRemove({
      //   req,
      //   res,
      //   docQRL,
      // });
    } else if (method === 'removeMany') {
      // return restPostRemoveMany({
      //   req,
      //   res,
      //   docQRL,
      // });
    } else if (method === 'count') {
      // return restPostCount({ res, docQRL });
    } else if (method === 'aggregate') {
      // return restPostAggregate({
      //   res,
      //   params,
      //   docQRL,
      // });
    } else if (method === 'insert') {
      // return restPostInsert({
      //   req,
      //   res,
      //   docQRL,
      // });
    } else if (method === 'upsert') {
      // return restPostUpsert({
      //   //req,
      //   res,
      //   docQRL,
      // });
    } else if (method === 'insertMany') {
      // return restPostInsertMany({
      //   req,
      //   res,
      //   docQRL,
      // });
    } else if (method === 'upsertMany') {
      // return restPostUpsertMany({
      //   //req,
      //   res,
      //   docQRL,
      // });
    } else if (collectionName === '_User' && method === 'signUp') {
      // return restPostSignUp({
      //   res,
      //   req,
      //   docQRL,
      // });
    } else if (collectionName === '_User' && method === 'signIn') {
      // return restPostSignIn({
      //   res,
      //   docQRL,
      // });
    } else if (collectionName === '_User' && method === 'updateEmail') {
      // return restPostUpdateEmail({
      //   res,
      //   docQRL,
      // });
    } else if (collectionName === '_User' && method === 'updatePassword') {
      // return restPostUpdatePassword({
      //   res,
      //   docQRL,
      // });
    } else if (collectionName === '_User' && method === 'passwordForgot') {
      // return restPostPasswordForgot({
      //   res,
      //   docQRL,
      // });
    } else if (collectionName === '_User' && method === 'passwordReset') {
      // return restPostPasswordReset({
      //   res,
      //   docQRL,
      // });
    }

    return Promise.reject(
      new BordaError(
        ErrorCode.REST_METHOD_NOT_FOUND,
        'rest method not found'
      ).toJSON()
    );
  } catch (err) {
    return Promise.reject(
      new BordaError(ErrorCode.REST_POST_ERROR, err as object).toJSON()
    );
  }
}

export function restPut({
  params,
  request,
  body,
  db,
  cache,
}: {
  params: any;
  request: Request & any;
  body: any;
  db: Db;
  cache: Cache;
}) {
  try {
    const inspect = request.inspect;
    const unlocked = request.unlocked;

    const { doc, options } = body;
    const { objectId } = params;

    const collectionName =
      InternalCollectionName[params['collectionName']] ??
      params['collectionName'];

    /**
     * query against to any of the reserved collections
     * if not unlocked should be strictly forbidden
     */
    const reservedCollections = [
      ...Object.keys(InternalCollectionName),
      ...Object.keys(ExternalCollectionName),
    ];

    if (!unlocked && reservedCollections.includes(collectionName)) {
      return Promise.reject(
        new BordaError(
          ErrorCode.QUERY_NOT_ALLOWED,
          `You can't execute the operation 'put' on '${
            ExternalCollectionName[collectionName] ?? collectionName
          }' because it's a reserved collection`
        ).toJSON()
      );
    }

    const docQRLFrom: DocQRLFrom = {
      doc,
      method: 'put',
      collection: collectionName,
      options,
    };

    const docQRL = parseQuery({
      from: docQRLFrom,
      db,
      inspect,
    });

    // call the operation
    return put({
      docQRL,
      objectId,
      inspect,
      unlocked,
      cache,
      request,
    });
  } catch (err) {
    return Promise.reject(
      new BordaError(ErrorCode.REST_POST_ERROR, err as object).toJSON()
    );
  }
}

export function restGet({
  params,
  request,
  db,
  query,
  cache,
  q,
}: {
  params: any;
  request: Request & any;
  db: Db;
  query: any;
  cache: Cache;
  q: (collection: string) => BordaQuery;
}) {
  try {
    const inspect = request.inspect;
    const unlocked = request.unlocked;

    const { include, exclude } = query;

    const { objectId } = params;

    const collectionName =
      InternalCollectionName[params['collectionName']] ??
      params['collectionName'];

    /**
     * query against to any of the reserved collections
     * if not unlocked should be strictly forbidden
     */
    const reservedCollections = [
      ...Object.keys(InternalCollectionName),
      ...Object.keys(ExternalCollectionName),
    ];

    if (!unlocked && reservedCollections.includes(collectionName)) {
      return Promise.reject(
        new BordaError(
          ErrorCode.QUERY_NOT_ALLOWED,
          `You can't execute the operation 'get' on '${
            ExternalCollectionName[collectionName] ?? collectionName
          }' because it's a reserved collection`
        ).toJSON()
      );
    }

    const docQRLFrom: DocQRLFrom = {
      include,
      exclude,
      method: 'get',
      collection: collectionName,
    };

    const docQRL = parseQuery({
      from: docQRLFrom,
      db,
      inspect,
    });

    // call the operation
    return get({
      docQRL,
      objectId,
      unlocked,
      inspect,
      cache,
      query: q,
    });
  } catch (err) {
    return Promise.reject(
      new BordaError(ErrorCode.REST_GET_ERROR, err as object).toJSON()
    );
  }
}
