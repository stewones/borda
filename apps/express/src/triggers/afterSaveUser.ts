import { Cloud } from '@elegante/server';
import { query } from '@elegante/sdk';

Cloud.afterSave('User', ({ before, after }) => {
  /**
   * if before doesn't existe it means that's a insert
   * so we can create a new user at our PublicUser collection
   */
  if (!before) {
    const { name, email } = after;
    query('PublicUser').unlock(true).insert({
      name,
      email,
    });
  }
});
