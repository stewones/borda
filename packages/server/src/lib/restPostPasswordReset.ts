import { Response } from 'express';

import {
  EleganteError,
  ErrorCode,
  isEmpty,
  Password,
  pointer,
  query,
  Session,
} from '@elegante/sdk';

import { DocQRL } from './parseQuery';
import {
  compare,
  hash,
  validate,
} from './utils/password';

export async function restPostPasswordReset({
  res,
  docQRL,
}: {
  docQRL: DocQRL;
  res: Response;
}) {
  const { doc } = docQRL;
  const { token, password } = doc ?? {};

  /**
   * validation chain
   */
  if (!password) {
    return res
      .status(400)
      .json(
        new EleganteError(ErrorCode.AUTH_PASSWORD_REQUIRED, 'password required')
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

  const p = await query<Password>('Password')
    .unlock()
    .include(['user'])
    .filter({
      type: 'forgot',
      token,
    })
    .findOne();

  if (isEmpty(p)) {
    return res
      .status(400)
      .json(
        new EleganteError(
          ErrorCode.AUTH_PASSWORD_TOKEN_INCORRECT,
          'Invalid token. Please try again with a new password reset link.'
        )
      );
  }

  const { user } = p;

  // check for password history
  const passwordHistory = await query<Password>('Password')
    .unlock()
    .filter({
      user: pointer('User', user.objectId),
      type: 'history',
    })
    .limit(5)
    .sort({ createdAt: -1 })
    .find();

  for (const history of passwordHistory) {
    if (await compare(password, history.password ?? '')) {
      return res
        .status(400)
        .json(
          new EleganteError(
            ErrorCode.AUTH_PASSWORD_ALREADY_EXISTS,
            'The new password must be different from the last used ones.'
          )
        );
    }
  }

  // update user's password
  const newPasswordHashed = await hash(password);
  await query('User').unlock().update(user.objectId, {
    password: newPasswordHashed,
  });

  // include to password history
  await query<Password>('Password')
    .unlock()
    .insert({
      user: pointer('User', user.objectId),
      password: newPasswordHashed,
      type: 'history',
      expiresAt: new Date(
        Date.now() + 1000 * 60 * 60 * 24 * 365 * 2
      ).toISOString(), // expires in 2 years
    });

  // invalidate all sessions
  const sessions = await query<Session>('Session')
    .unlock()
    .filter({
      user: pointer('User', user.objectId),
    })
    .find();
  for (const session of sessions) {
    await query('Session').unlock().delete(session.objectId);
  }

  return res.status(201).send();
}
