import { Request, Response } from 'express';

import {
  EleganteError,
  ErrorCode,
  isEmpty,
  query,
  User,
  validateEmail,
} from '@elegante/sdk';

import { hash, validate } from '../utils/password';
import { CloudTriggerCallback, getCloudBeforeSignUpTrigger } from './Cloud';
import { DocQRL } from './parseQuery';
import { createSessionOld } from './public';

export async function restPostSignUp({
  res,
  req,
  docQRL,
}: {
  docQRL: DocQRL;
  res: Response;
  req: Request;
}) {
  try {
    const { projection, include, exclude, doc } = docQRL;

    const { name, email, password } = doc ?? {};

    /**
     * validation chain
     */
    if (!name) {
      return res
        .status(400)
        .json(
          new EleganteError(
            ErrorCode.AUTH_NAME_REQUIRED,
            'Name required'
          ).toJSON()
        );
    } else if (!validateEmail(email)) {
      return res
        .status(400)
        .json(
          new EleganteError(
            ErrorCode.AUTH_INVALID_EMAIL,
            'Invalid email address'
          )
        );
    } else if (!password) {
      return res
        .status(400)
        .json(
          new EleganteError(
            ErrorCode.AUTH_PASSWORD_REQUIRED,
            'The password is invalid'
          )
        );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const valid = (await validate(password, { details: true })) as any[];
    const validation = valid.map((v) => v.message);
    if (validation.length > 0) {
      return res
        .status(400)
        .json(
          new EleganteError(
            ErrorCode.AUTH_PASSWORD_INCORRECT,
            validation[0]
          ).toJSON()
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
    // run beforeSignUp hooks
    let beforeSignUpCallback: CloudTriggerCallback = true;
    const beforeSignUp = getCloudBeforeSignUpTrigger();
    if (beforeSignUp) {
      beforeSignUpCallback = await beforeSignUp.fn({
        before: undefined,
        after: undefined,
        doc: docQRL.doc ?? undefined,
        qrl: docQRL,
        context: docQRL.options?.context ?? {},
        user: res.locals['session']?.user,
        req,
        res,
      } as any);
    }

    if (beforeSignUpCallback) {
      if (
        beforeSignUpCallback &&
        typeof beforeSignUpCallback === 'object' &&
        beforeSignUpCallback.doc
      ) {
        docQRL.doc = beforeSignUpCallback.doc;
      }
    }

    const newUser = await query<User>('User')
      .unlock()
      .insert({
        name,
        ...docQRL.doc,
        email: email.toLowerCase(),
        password: await hash(password),
      });

    const currentUser = await query<User>('User')
      .unlock()
      .projection(
        !isEmpty(projection)
          ? {
              ...projection,
              objectId: 1,
            }
          : // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ({} as any)
      )
      .include(include ?? [])
      .exclude(exclude ?? [])
      .filter({
        objectId: newUser.objectId,
        expiresAt: {
          $exists: false,
        },
      })
      .findOne();

    const session = await createSessionOld(currentUser);
    return res.status(201).json(session);
  } catch (err) {
    return res.status(500).json(err);
  }
}
