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
import { hash } from './utils/password';

export async function restPostSignUp({
  res,
  docQRL,
}: {
  docQRL: DocQRL;
  res: Response;
}) {
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
