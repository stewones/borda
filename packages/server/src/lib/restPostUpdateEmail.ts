import { Response } from 'express';

import {
  EleganteError,
  ErrorCode,
  isEmpty,
  query,
  User,
  validateEmail,
} from '@elegante/sdk';

import { DocQRL } from './parseQuery';
import { createSession } from './public';
import { compare } from './utils/password';

export async function restPostUpdateEmail({
  res,
  docQRL,
}: {
  docQRL: DocQRL;
  res: Response;
}) {
  const { projection, include, exclude, doc } = docQRL;

  const { email, password } = doc ?? {};

  const { session } = res.locals;
  const { user } = session;

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

  const checkIfEmailExists = await query<User>('User')
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

  if (!isEmpty(checkIfEmailExists)) {
    return res
      .status(400)
      .json(
        new EleganteError(
          ErrorCode.AUTH_EMAIL_ALREADY_EXISTS,
          'This email already exists'
        )
      );
  }

  const currentUser = await query<User>('User')
    .unlock()
    .projection(
      !isEmpty(projection)
        ? {
            ...projection,
            password: 1,
          }
        : // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ({} as any)
    )
    .include(include ?? [])
    .exclude(exclude ?? [])
    .filter({
      email: {
        $eq: user.email,
      },
      expiresAt: {
        $exists: false,
      },
    })
    .findOne();

  if (isEmpty(currentUser)) {
    return res
      .status(404)
      .json(
        new EleganteError(
          ErrorCode.AUTH_EMAIL_NOT_FOUND,
          `This email doesn't exist`
        )
      );
  }

  if (!(await compare(password, currentUser.password ?? ''))) {
    return res
      .status(400)
      .json(
        new EleganteError(
          ErrorCode.AUTH_PASSWORD_INCORRECT,
          'password incorrect'
        )
      );
  }

  await query('User').unlock().update(currentUser.objectId, {
    email: email.toLowerCase(),
  });

  const newSession = await createSession({
    ...currentUser,
    email: email.toLowerCase(),
  });

  return res.status(201).json(newSession);
}
