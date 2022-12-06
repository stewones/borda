import { Cloud } from '@elegante/server';
import { query } from '@elegante/sdk';

Cloud.afterSave('User', ({ docQRL, before, after }) => {
  /**
   * means it's a new document
   * so we can create a new user on a public Collection
   */
  if (!before) {
    console.log('after save user docQRL', docQRL);
    const { name, email } = after;
    query('PublicUser').unlock(true).insert({
      name,
      email,
    });
  }
});
