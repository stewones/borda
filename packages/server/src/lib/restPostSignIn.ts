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

export async function restPostSignIn({
  res,
  docQRL,
}: {
  docQRL: DocQRL;
  res: Response;
}) {
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
            objectId: 1,
          }
        : // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ({} as any)
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
