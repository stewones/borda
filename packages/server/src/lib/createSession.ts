import { pointer, query, Session, User } from '@elegante/sdk';
import { newToken } from './utils/crypto';

export async function createSession(user: User) {
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
  const token = `e:${newToken()}`;
  const session = await query<Partial<Session>>('Session')
    .unlock(true)
    .insert({
      user: pointer('User', user.objectId),
      token,
      expiresAt: expiresAt.toISOString(),
    });

  delete session.updatedAt;
  delete session.objectId;

  return { ...session, user };
}
