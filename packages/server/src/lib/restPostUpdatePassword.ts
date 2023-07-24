import { Response } from 'express';

import {
  EleganteError,
  ErrorCode,
  isEmpty,
  Password,
  pointer,
  query,
  Session,
  User,
} from '@elegante/sdk';

import { Cache } from './Cache';
import { DocQRL } from './parseQuery';
import { createSession } from './public';
import { compare, hash, validate } from './utils/password';

export async function restPostUpdatePassword({
  res,
  docQRL,
}: {
  docQRL: DocQRL;
  res: Response;
}) {
  const { projection, include, exclude, doc } = docQRL;
  const { currentPassword, newPassword } = doc ?? {};
  const { session } = res.locals;
  const { user } = session;

  /**
   * validation chain
   */
  if (!currentPassword || !newPassword) {
    return res
      .status(400)
      .json(
        new EleganteError(
          ErrorCode.AUTH_PASSWORD_REQUIRED,
          'Password is required'
        ).toJSON()
      );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const valid = (await validate(newPassword, { details: true })) as any[];
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

  const currentUser = await query<User>('User')
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
          ErrorCode.AUTH_USER_NOT_FOUND,
          `This user doesn't exist`
        )
      );
  }

  if (!(await compare(currentPassword, currentUser.password ?? ''))) {
    return res
      .status(400)
      .json(
        new EleganteError(
          ErrorCode.AUTH_PASSWORD_INCORRECT,
          'Current password is incorrect'
        )
      );
  }

  if (await compare(newPassword, currentUser.password ?? '')) {
    return res
      .status(400)
      .json(
        new EleganteError(
          ErrorCode.AUTH_PASSWORD_ALREADY_EXISTS,
          'The new password must be different from the current password'
        )
      );
  }

  const newPasswordHashed = await hash(newPassword);

  // check for password history
  const passwordHistory = await query<Password>('Password')
    .unlock()
    .filter({
      user: pointer('User', currentUser.objectId),
      type: 'history',
    })
    .limit(5)
    .sort({ createdAt: -1 })
    .find();

  for (const history of passwordHistory) {
    if (await compare(newPassword, history.password ?? '')) {
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
  await query('User').unlock().update(currentUser.objectId, {
    password: newPasswordHashed,
  });

  // include to password history
  await query<Password>('Password')
    .unlock()
    .insert({
      user: pointer('User', currentUser.objectId),
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
      user: pointer('User', currentUser.objectId),
    })
    .find();
  for (const session of sessions) {
    await query('Session').unlock().delete(session.objectId);
  }

  // invalidate all cached users
  Cache.invalidate('_User', currentUser.objectId);

  const newSession = await createSession({
    ...currentUser,
    email: currentUser.email,
  });

  return res.status(200).json(newSession);
}
