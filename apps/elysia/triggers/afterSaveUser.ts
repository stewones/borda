import { CloudTriggerParams } from '@borda/server';

import { borda } from '../';

export function afterSaveUser({ doc, before }: CloudTriggerParams) {
  /**
   * if before doesn't existe it means that's a insert
   * so we can create a new user at our PublicUser collection
   */
  if (!before) {
    const { name, email } = doc || {};
    borda.query('PublicUser').insert({
      name,
      email,
    });
  }
}
