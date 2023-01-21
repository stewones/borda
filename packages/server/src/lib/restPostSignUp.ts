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
import {
  hash,
  validate,
} from './utils/password';

export async function restPostSignUp({
  res,
  docQRL,
}: {
  docQRL: DocQRL;
  res: Response;
}) {
  const { projection, include, exclude, doc } = docQRL;

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
          ErrorCode.AUTH_PASSWORD_REQUIRED,
          'password incorrect'
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
        new EleganteError(ErrorCode.AUTH_PASSWORD_INCORRECT, validation[0])
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

  const session = await createSession(currentUser);

  return res.status(201).json(session);
}
