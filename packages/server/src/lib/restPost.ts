/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  query,
  EleganteError,
  ErrorCode,
  Document,
  InternalHeaders,
  QueryMethod,
  validateEmail,
  User,
  isEmpty,
  Session,
  pointer,
} from '@elegante/sdk';

import { Request, Response } from 'express';
import { createFindCursor } from './createFindCursor';
import { createPipeline } from './createPipeline';
import { ServerParams } from './EleganteServer';
import { parseDoc, parseDocForInsertion, parseDocs } from './parseDoc';
import { parseFilter } from './parseFilter';
import { DocQRL, parseQuery } from './parseQuery';
import { parseResponse } from './parseResponse';
import { newObjectId, newToken } from './utils/crypto';
import { isUnlocked } from './utils/isUnlocked';
import { compare } from './utils/password';

export function restPost({
  params,
}: {
  params: ServerParams;
}): (req: Request, res: Response) => void {
  return async (req: Request, res: Response) => {
    try {
      const collectionName = req.params['collectionName'];

      const method = req.header(
        `${params.serverHeaderPrefix}-${InternalHeaders['apiMethod']}`
      ) as QueryMethod;

      if (!method) {
        throw new EleganteError(
          ErrorCode.REST_METHOD_REQUIRED,
          'Method required'
        );
      }

      const docQRL = parseQuery({
        ...req.body,
        collection: collectionName,
      });

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
         * @todo run beforeUpdate and afterUpdate hooks
         */
        const { cursor, before } = await postUpdate(docQRL);
        if (cursor.ok) {
          const after = cursor.value;
          const afterSaveTrigger = parseResponse(
            {
              before,
              after,
            },
            {
              removeSensitiveFields: !isUnlocked(res.locals),
            }
          );
          //
          // more values to be added
          //   query,
          //  params,
          //  locals: res.locals,

          // @todo run afterSaveTrigger
          return res.status(200).send();
        }

        return Promise.reject(
          new EleganteError(
            ErrorCode.REST_DOCUMENT_NOT_UPDATED,
            'could not update document'
          )
        );
      } else if (method === 'delete') {
        /**
         * delete
         * @todo run beforeDeleteTrigger and afterDeleteTrigger
         */
        const { cursor } = await postDelete(docQRL);

        if (cursor.ok && cursor.value) {
          const afterDeleteTrigger = parseResponse(
            { doc: cursor.value },
            {
              removeSensitiveFields: !isUnlocked(res.locals),
            }
          );
          // console.log(afterDeleteTrigger);
          // @todo trigger afterDeleteTrigger
          return res.status(200).send();
        } else {
          res
            .status(404)
            .json(
              new EleganteError(
                ErrorCode.REST_DOCUMENT_NOT_FOUND,
                'document not found'
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
      } else if (method && method === 'aggregate') {
        /**
         * aggregate
         * @todo run beforeAggregate and afterAggregate triggers
         */
        const docs = await postAggregate(docQRL);
        return res
          .status(200)
          .send(await parseDocs(docs)(docQRL, params, res.locals));
      } else if (method === 'insert') {
        /**
         * insert new documents
         * @todo run beforeInsert and afterInsert triggers
         */
        const doc = {
          ...parseDocForInsertion(req.body),
          _id: newObjectId(),
          _created_at: new Date(),
          _updated_at: new Date(),
        };
        const cursor = await collection$.insertOne(doc);

        if (cursor.acknowledged) {
          const afterSaveTrigger = parseResponse(
            { before: null, after: doc },
            {
              removeSensitiveFields: !isUnlocked(res.locals),
            }
          );
          // @todo run afterSaveTrigger
          return res.status(201).send(doc);
        }

        return Promise.reject(
          new EleganteError(
            ErrorCode.REST_DOCUMENT_NOT_CREATED,
            'could not create document'
          )
        );
      } else if (collectionName === 'User' && method === 'signUp') {
        /**
         * user sign up
         */
        // postSignUp(docQRL);
      } else if (collectionName === 'User' && method === 'signIn') {
        /**
         * user sign in
         */
        return postSignIn(
          docQRL as DocQRL & { email: string; password: string },
          res
        );
      } else {
        // console.log(collectionName, method);
        throw new EleganteError(
          ErrorCode.REST_METHOD_NOT_FOUND,
          'Method not found'
        );
      }
    } catch (err) {
      return res
        .status(500)
        .send(new EleganteError(ErrorCode.REST_POST_ERROR, err as object));
    }
  };
}

async function postFind(query: DocQRL) {
  const docs: Document[] = [];
  const cursor = createFindCursor(query);
  await cursor.forEach((doc) => {
    docs.push(doc);
  });
  return docs;
}

async function postUpdate(query: DocQRL) {
  const { filter, collection$, doc } = query;

  const before = await collection$.findOne(parseFilter(filter), {
    readPreference: 'primary',
  });

  const cursor = await collection$.findOneAndUpdate(
    parseFilter(filter),
    {
      $set: {
        ...(doc ?? {}),
        _updated_at: new Date(),
      },
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

async function postSignIn(
  docQRL: DocQRL & { email: string; password: string },
  res: Response
) {
  const { projection, include, exclude } = docQRL;

  /**
   * validation chain
   */
  if (!validateEmail(docQRL.email)) {
    return res
      .status(400)
      .json(
        new EleganteError(ErrorCode.AUTH_INVALID_EMAIL, 'Invalid email address')
      );
  } else if (!docQRL.password) {
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
        $eq: docQRL.email,
      },
    })
    .findOne();

  if (!user) {
    return res
      .status(404)
      .json(
        new EleganteError(ErrorCode.AUTH_INVALID_EMAIL, 'Invalid email address')
      );
  }

  if (!(await compare(docQRL.password, user.password ?? ''))) {
    return res
      .status(400)
      .json(
        new EleganteError(
          ErrorCode.AUTH_PASSWORD_INCORRECT,
          'password incorrect'
        )
      );
  }

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
  const sessionToken = `e:${newToken()}`;
  const session = await query<Session>('Session')
    .unlock(true)
    .insert({
      user: pointer('User', user.objectId),
      sessionToken,
      expiresAt: expiresAt.toISOString(),
    });

  delete session.updatedAt;
  delete session.objectId;

  return res.status(201).json({ ...session, user });
}

// async function postSignUp(query: DocQRL) {}
