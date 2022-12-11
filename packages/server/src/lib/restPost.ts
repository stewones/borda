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
} from '@elegante/sdk';

import { Request, Response } from 'express';
import { getCloudTrigger } from './Cloud';
import {
  ServerParams,
  createFindCursor,
  createPipeline,
  createSession,
} from './Server';
import { invalidateCache } from './Cache';
import { parseDoc, parseDocForInsertion, parseDocs } from './parseDoc';
import { parseFilter } from './parseFilter';
import { DocQRL, DocQRLFrom, parseQuery } from './parseQuery';
import { parseResponse } from './parseResponse';
import { newObjectId } from './utils/crypto';
import { isUnlocked } from './utils/isUnlocked';
import { compare, hash } from './utils/password';

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

      // let body = req.body;
      // if (collectionName === '_User' && ['signIn', 'signUp'].includes(method)) {
      //   body = {
      //     ...body,
      //     doc: {
      //       name: req.body.name,
      //       email: req.body.email,
      //       password: req.body.password,
      //     },
      //   };
      //   delete body.name;
      //   delete body.email;
      //   delete body.password;
      // }

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
          .send(
            method === 'findOne'
              ? await parseDoc(docs[0])(docQRL, params, res.locals)
              : await parseDocs(docs)(docQRL, params, res.locals)
          );
      } else if (method === 'update') {
        /**
         * update
         */
        let shouldRun: boolean | void = true;
        const beforeSave = getCloudTrigger(collectionName, 'beforeSave');
        if (beforeSave) {
          const { doc } = docQRLFrom;
          shouldRun = await beforeSave.fn({
            req,
            res,
            docQRL,
            before: doc ?? null,
            after: null,
          });
        }

        if (shouldRun) {
          const { cursor, before } = await postUpdate(docQRL, res);
          if (cursor.ok) {
            const after = cursor.value ?? ({} as Document);
            const afterSavePayload = parseResponse(
              {
                before,
                after,
              },
              {
                removeSensitiveFields: !isUnlocked(res.locals),
              }
            );

            const afterSave = getCloudTrigger(collectionName, 'afterSave');
            if (afterSave) {
              afterSave.fn({
                req,
                res,
                ...afterSavePayload,
                docQRL,
              });
            }

            // @todo run afterSaveTrigger

            invalidateCache(collectionName, after);
            return res.status(200).send();
          }
        }

        return Promise.reject(
          new EleganteError(
            ErrorCode.REST_DOCUMENT_NOT_UPDATED,
            'could not update document'
          )
        );
      } else if (method === 'remove') {
        /**
         * remove
         * @todo run beforeDeleteTrigger and afterDeleteTrigger
         */
        const { cursor } = await postDelete(docQRL);

        if (cursor.ok && cursor.value) {
          const doc = cursor.value ?? ({} as Document);
          const afterDeleteTrigger = parseResponse(
            { doc },
            {
              removeSensitiveFields: !isUnlocked(res.locals),
            }
          );
          // console.log(afterDeleteTrigger);
          // @todo trigger afterDeleteTrigger

          invalidateCache(collectionName, doc);
          return res.status(200).send();
        } else {
          res
            .status(404)
            .json(
              new EleganteError(
                ErrorCode.REST_DOCUMENT_NOT_FOUND,
                'could not remove document'
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
        /**
         * insert new documents
         */
        const doc: Document = {
          ...parseDocForInsertion(req.body.doc),
          _id: newObjectId(),
          _created_at: new Date(),
          _updated_at: new Date(),
        };

        let shouldRun: boolean | void = true;
        const beforeSave = getCloudTrigger(collectionName, 'beforeSave');
        if (beforeSave) {
          const { doc } = docQRLFrom;
          shouldRun = await beforeSave.fn({
            req,
            res,
            docQRL,
            before: null,
            after: doc,
          });
        }

        if (shouldRun) {
          const cursor = await collection$.insertOne(doc);

          if (cursor.acknowledged) {
            const afterSavePayload = parseResponse(
              { before: null, after: doc },
              {
                removeSensitiveFields: !isUnlocked(res.locals),
              }
            );

            const afterSave = getCloudTrigger(collectionName, 'afterSave');
            if (afterSave) {
              afterSave.fn({
                req,
                res,
                ...afterSavePayload,
                docQRL,
              });
            }

            return res.status(201).send(doc);
          }
        }

        return Promise.reject(
          new EleganteError(
            ErrorCode.REST_DOCUMENT_NOT_CREATED,
            'could not create document'
          )
        );
      } else if (collectionName === '_User' && method === 'signUp') {
        /**
         * user sign up
         */
        return postSignUp(docQRL, res);
      } else if (collectionName === '_User' && method === 'signIn') {
        /**
         * user sign in
         */
        return postSignIn(docQRL, res);
      } else {
        throw new EleganteError(
          ErrorCode.REST_METHOD_NOT_FOUND,
          'Method not found'
        );
      }
    } catch (err: any) {
      return res
        .status(405)
        .send(
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
  const { filter, collection$, doc } = docQRL;

  const before = await collection$.findOne(parseFilter(filter), {
    readPreference: 'primary',
  });

  const payload: any = {
    ...(doc ?? {}),
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
      delete payload[field];
    });
  }

  const cursor = await collection$.findOneAndUpdate(
    parseFilter(filter),
    {
      $set: payload,
    },
    { returnDocument: 'after', readPreference: 'primary' }
  );

  return {
    before,
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

  const cursor = collection$.aggregate<Document>(
    createPipeline<Document>({
      filter: filter ?? {},
      pipeline,
      projection: projection ?? {},
      limit: limit ?? 10000,
      skip: skip ?? 0,
      sort: sort ?? {},
    }),
    options
  );

  for await (const doc of cursor) {
    docs.push(doc);
  }

  return docs;
}

async function postSignIn(docQRL: DocQRL, res: Response) {
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
    .unlock(true)
    .projection(
      !isEmpty(projection)
        ? {
            ...projection,
            password: 1,
          }
        : {}
    )
    .include(include ?? [])
    .exclude(exclude ?? [])
    .filter({
      email: {
        $eq: email,
      },
    })
    .findOne();

  if (!user) {
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
    .unlock(true)
    .projection({ email: 1 })
    .filter({
      email: {
        $eq: email,
      },
    })
    .findOne();

  if (checkUserExists) {
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
    .unlock(true)
    .insert({
      name,
      email,
      password: await hash(password),
    });

  const session = await createSession(newUser);

  return res.status(201).json(session);
}
