/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  query,
  EleganteError,
  ErrorCode,
  ExternalFieldName,
  ExternalCollectionName,
  InternalCollectionName,
  InternalFieldName,
  InternalHeaders,
  isEmpty,
  Document,
  QueryMethod,
  validateEmail,
  User,
  log,
  objectFieldsUpdated,
  objectFieldsCreated,
} from '@elegante/sdk';

import { Request, Response } from 'express';
import { CloudTriggerCallback, getCloudTrigger } from './Cloud';
import { ServerParams, createFindCursor, createPipeline } from './Server';
import { invalidateCache } from './Cache';
import { parseDoc, parseDocForInsertion, parseDocs } from './parseDoc';
import { parseFilter } from './parseFilter';
import { DocQRL, DocQRLFrom, parseQuery } from './parseQuery';
import { parseResponse } from './parseResponse';
import { newObjectId } from './utils/crypto';
import { isUnlocked } from './utils/isUnlocked';
import { compare, hash } from './utils/password';
import { createSession } from './public';
import { AggregateOptions } from 'mongodb';

export function restPost({
  params,
}: {
  params: ServerParams;
}): (req: Request, res: Response) => void {
  return async (req: Request, res: Response) => {
    try {
      const collectionName =
        InternalCollectionName[req.params['collectionName']] ??
        req.params['collectionName'];

      const method = req.header(
        `${params.serverHeaderPrefix}-${InternalHeaders['apiMethod']}`
      ) as QueryMethod;

      if (!method) {
        throw new EleganteError(
          ErrorCode.REST_METHOD_REQUIRED,
          'Method required'
        );
      }

      /**
       * can't find to any of the reserved collections if not unlocked
       */
      const reservedCollections = [
        ...Object.keys(InternalCollectionName),
        ...Object.keys(ExternalCollectionName),
      ];

      if (
        !['signIn', 'signUp'].includes(method) &&
        !isUnlocked(res.locals) &&
        reservedCollections.includes(collectionName)
      ) {
        return res
          .status(405)
          .json(
            new EleganteError(
              ErrorCode.COLLECTION_NOT_ALLOWED,
              `You can't execute the operation '${method}' on '${
                ExternalCollectionName[collectionName] ?? collectionName
              }' because it's a reserved collection`
            )
          );
      }

      const docQRLFrom: DocQRLFrom = {
        ...req.body,
        collection: collectionName,
      };

      const docQRL = parseQuery(docQRLFrom);

      const { filter, collection$ } = docQRL;

      /**
       * find/findOne
       * @todo run beforeFind and afterFind hooks
       */
      if (['find', 'findOne'].includes(method)) {
        const docs = await postFind(docQRL);
        return res
          .status(200)
          .json(
            method === 'findOne'
              ? (await parseDoc(docs[0])(docQRL, params, res.locals)) ?? {}
              : (await parseDocs(docs)(docQRL, params, res.locals)) ?? []
          );
      } else if (method === 'update') {
        /**
         * update
         */
        const docBefore = await collection$.findOne(parseFilter(filter), {
          readPreference: 'primary',
        });

        let beforeSaveCallback: CloudTriggerCallback = true;
        const beforeSave = getCloudTrigger(collectionName, 'beforeSave');
        if (beforeSave) {
          beforeSaveCallback = await beforeSave.fn({
            before: docBefore ?? undefined,
            after: undefined,
            doc: docQRL.doc ?? undefined,
            qrl: docQRL,
            context: docQRL.options?.context ?? {},
            user: res.locals['session']?.user,
            req,
            res,
          });
        }

        if (beforeSaveCallback) {
          if (
            beforeSaveCallback &&
            typeof beforeSaveCallback === 'object' &&
            beforeSaveCallback.doc
          ) {
            docQRL.doc = beforeSaveCallback.doc;
          }

          const { cursor } = await postUpdate(docQRL, res);

          if (cursor.ok) {
            const docAfter = cursor.value ?? ({} as Document);
            const afterSavePayload = parseResponse(
              {
                before: docBefore,
                after: docAfter,
                doc: docQRL.doc,
                updatedFields: objectFieldsUpdated(docBefore, docAfter),
                createdFields: objectFieldsCreated(docBefore, docAfter),
              },
              {
                removeSensitiveFields: !isUnlocked(res.locals),
              }
            );

            const afterSave = getCloudTrigger(collectionName, 'afterSave');
            if (afterSave) {
              afterSave.fn({
                ...afterSavePayload,
                qrl: docQRL,
                context: docQRL.options?.context ?? {},
                user: res.locals['session']?.user,
                req,
                res,
              });
            }

            invalidateCache(collectionName, docAfter);
            return res.status(200).json({});
          } else {
            return Promise.reject(
              new EleganteError(
                ErrorCode.REST_DOCUMENT_NOT_UPDATED,
                `could not update ${collectionName} document`
              )
            );
          }
        }

        /**
         * didn't pass the beforeSave trigger
         * but also doesn't mean it's an error
         */
        return res.status(200).json({});
      } else if (method === 'remove') {
        /**
         * remove
         * @todo run beforeDelete trigger
         */
        const { cursor } = await postDelete(docQRL);

        if (cursor.ok && cursor.value) {
          const afterDeletePayload = parseResponse(
            { before: cursor.value, doc: cursor.value, after: null },
            {
              removeSensitiveFields: !isUnlocked(res.locals),
            }
          );
          const afterDelete = getCloudTrigger(collectionName, 'afterDelete');
          if (afterDelete) {
            afterDelete.fn({
              ...afterDeletePayload,
              qrl: docQRL,
              context: docQRL.options?.context ?? {},
              user: res.locals['session']?.user,
              req,
              res,
            });
          }

          invalidateCache(collectionName, afterDeletePayload.before);
          return res.status(200).json({});
        } else {
          res
            .status(404)
            .json(
              new EleganteError(
                ErrorCode.REST_DOCUMENT_NOT_FOUND,
                `could not remove ${collectionName} document`
              )
            );
        }
      } else if (method === 'count') {
        /**
         * count
         * @todo run beforeCount and afterCount triggers
         */
        const total = await collection$.countDocuments(parseFilter(filter));
        return res.status(200).json(total);
      } else if (method === 'aggregate') {
        /**
         * aggregate
         * @todo run beforeAggregate and afterAggregate triggers
         */
        const docs = await postAggregate(docQRL);

        return res
          .status(200)
          .json(await parseDocs(docs)(docQRL, params, res.locals));
      } else if (method === 'insert') {
        let beforeSaveCallback: CloudTriggerCallback = true;

        const beforeSave = getCloudTrigger(collectionName, 'beforeSave');

        if (beforeSave) {
          beforeSaveCallback = await beforeSave.fn({
            before: undefined,
            after: undefined,
            doc: docQRL.doc ?? undefined,
            qrl: docQRL,
            context: docQRL.options?.context ?? {},
            user: res.locals['session']?.user,
            req,
            res,
          });
        }

        if (
          beforeSaveCallback &&
          typeof beforeSaveCallback === 'object' &&
          beforeSaveCallback.doc
        ) {
          docQRL.doc = beforeSaveCallback.doc;
        }

        if (beforeSaveCallback) {
          /**
           * insert new documents
           */
          const doc: Document = {
            ...parseDocForInsertion(docQRL.doc),
            _id: newObjectId(),
            _created_at: new Date(),
            _updated_at: new Date(),
          };
          const cursor = await collection$.insertOne(doc);

          if (cursor.acknowledged) {
            const afterSavePayload = parseResponse(
              {
                before: null,
                after: doc,
                doc,
                updatedFields: objectFieldsUpdated({}, doc),
                createdFields: objectFieldsCreated({}, doc),
              },
              {
                removeSensitiveFields: !isUnlocked(res.locals),
              }
            );

            const afterSave = getCloudTrigger(collectionName, 'afterSave');
            if (afterSave) {
              afterSave.fn({
                ...afterSavePayload,
                qrl: docQRL,
                context: docQRL.options?.context ?? {},
                user: res.locals['session']?.user,
                req,
                res,
              });
            }

            return res.status(201).json(afterSavePayload.doc);
          } else {
            return Promise.reject(
              new EleganteError(
                ErrorCode.REST_DOCUMENT_NOT_CREATED,
                `could not create ${collectionName} document`
              )
            );
          }
        }

        /**
         * didn't pass the beforeSave trigger
         * but also doesn't mean it's an error
         */
        return res.status(200).json({});
      } else if (collectionName === '_User' && method === 'signUp') {
        /**
         * user sign up
         */
        return postSignUp(docQRL, res).catch((err) => {
          if (err && err.code === 11000) {
            return res
              .status(405)
              .json(
                new EleganteError(
                  ErrorCode.DATABASE_ERROR,
                  'duplicate key error E11000'
                )
              );
          }
          return res
            .status(405)
            .json(
              err?.code
                ? err
                : new EleganteError(ErrorCode.REST_POST_ERROR, err as object)
            );
        });
      } else if (collectionName === '_User' && method === 'signIn') {
        /**
         * user sign in
         */
        return postSignIn(docQRL as unknown as DocQRL<User>, res);
      } else {
        throw new EleganteError(
          ErrorCode.REST_METHOD_NOT_FOUND,
          'Method not found'
        );
      }
    } catch (err: any) {
      return res
        .status(405)
        .json(
          err?.code
            ? err
            : new EleganteError(ErrorCode.REST_POST_ERROR, err as object)
        );
    }
  };
}

async function postFind(docQRL: DocQRL) {
  const docs: Document[] = [];
  const cursor = createFindCursor(docQRL);
  await cursor.forEach((doc) => {
    docs.push(doc);
  });
  return docs;
}

async function postUpdate(docQRL: DocQRL, res: Response) {
  const { filter, collection$ } = docQRL;

  const doc: Document = {
    ...parseDocForInsertion(docQRL.doc),
    _updated_at: new Date(),
  };

  /**
   * ensure each internal/external field is deleted from the user payload
   * if session is not unlocked
   */
  const reservedFields = [
    ...Object.keys(InternalFieldName),
    ...Object.keys(ExternalFieldName),
  ];

  if (!isUnlocked(res.locals)) {
    reservedFields.forEach((field) => {
      delete doc[field];
    });
  }

  const cursor = await collection$.findOneAndUpdate(
    parseFilter(filter),
    {
      $set: doc,
    },
    { returnDocument: 'after', readPreference: 'primary' }
  );

  return {
    cursor,
  };
}

async function postDelete(query: DocQRL) {
  const { filter, collection$ } = query;

  const cursor = await collection$.findOneAndUpdate(
    parseFilter(filter),
    { $set: { _expires_at: new Date() } },
    {
      returnDocument: 'after',
      readPreference: 'primary',
    }
  );

  return {
    cursor,
  };
}

async function postAggregate(query: DocQRL) {
  const {
    collection$,
    pipeline,
    projection,
    filter,
    limit,
    skip,
    sort,
    options,
  } = query;

  const docs: Document[] = [];
  const pipe = createPipeline<Document>({
    filter: filter ?? {},
    pipeline: pipeline ?? ([] as any),
    projection: projection ?? ({} as any),
    limit: limit ?? 10000,
    skip: skip ?? 0,
    sort: sort ?? {},
  });

  log('pipeline', JSON.stringify(pipe));

  const cursor = collection$.aggregate<Document>(
    pipe,
    options as AggregateOptions
  );

  for await (const doc of cursor) {
    docs.push(doc);
  }

  return docs;
}

async function postSignIn(docQRL: DocQRL<User>, res: Response) {
  const { projection, include, exclude, doc } = docQRL;
  const { email, password } = doc ?? {};
  /**
   * validation chain
   */
  if (!validateEmail(email)) {
    return res
      .status(400)
      .json(
        new EleganteError(ErrorCode.AUTH_INVALID_EMAIL, 'Invalid email address')
      );
  } else if (!password) {
    return res
      .status(400)
      .json(
        new EleganteError(
          ErrorCode.AUTH_PASSWORD_INCORRECT,
          'password incorrect'
        )
      );
  }

  const user = await query<User>('User')
    .unlock()
    .projection(
      !isEmpty(projection)
        ? {
            ...projection,
            password: 1,
          }
        : ({} as any)
    )
    .include(include ?? [])
    .exclude(exclude ?? [])
    .filter({
      email: {
        $eq: email,
      },
      expiresAt: {
        $exists: false,
      },
    })
    .findOne();

  if (isEmpty(user)) {
    return res
      .status(404)
      .json(
        new EleganteError(ErrorCode.AUTH_EMAIL_NOT_FOUND, 'User not found')
      );
  }

  if (!(await compare(password, user.password ?? ''))) {
    return res
      .status(400)
      .json(
        new EleganteError(
          ErrorCode.AUTH_PASSWORD_INCORRECT,
          'password incorrect'
        )
      );
  }

  const session = await createSession(user);

  return res.status(201).json(session);
}

async function postSignUp(docQRL: DocQRL, res: Response) {
  const { doc } = docQRL;

  const { name, email, password } = doc ?? {};

  /**
   * validation chain
   */
  if (!name) {
    return res
      .status(400)
      .json(new EleganteError(ErrorCode.AUTH_NAME_REQUIRED, 'Name required'));
  } else if (!validateEmail(email)) {
    return res
      .status(400)
      .json(
        new EleganteError(ErrorCode.AUTH_INVALID_EMAIL, 'Invalid email address')
      );
  } else if (!password) {
    return res
      .status(400)
      .json(
        new EleganteError(
          ErrorCode.AUTH_PASSWORD_INCORRECT,
          'password incorrect'
        )
      );
  }

  const checkUserExists = await query<User>('User')
    .unlock()
    .projection({ email: 1 })
    .filter({
      email: {
        $eq: email,
      },
      expiresAt: {
        $exists: false,
      },
    })
    .findOne();

  if (!isEmpty(checkUserExists)) {
    return res
      .status(404)
      .json(
        new EleganteError(
          ErrorCode.AUTH_EMAIL_ALREADY_EXISTS,
          'This email is already in use'
        )
      );
  }

  const newUser = await query<User>('User')
    .unlock()
    .insert({
      ...doc,
      name,
      email: email.toLowerCase(),
      password: await hash(password),
    });

  const session = await createSession(newUser);

  return res.status(201).json(session);
}
