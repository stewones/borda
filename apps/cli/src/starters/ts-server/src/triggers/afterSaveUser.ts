import { query } from '@elegante/sdk';
import { Cloud } from '@elegante/server';

Cloud.afterSave('User', ({ doc, before }) => {
  /**
   * if before doesn't existe it means that's a insert
   * so we can create a new user at our PublicUser collection
   */
  if (!before) {
    const { name, email } = doc || {};
    query('PublicUser').unlock().insert({
      name,
      email,
    });
  }
});
