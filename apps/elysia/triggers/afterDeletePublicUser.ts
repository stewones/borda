import { CloudTriggerParams } from '@borda/server';

import { borda } from '../';

export function afterDeletePublicUser({ doc }: CloudTriggerParams) {
  borda
    .query('User')
    .filter({
      email: {
        $eq: doc!['email'],
      },
    })
    .delete()
    .catch((err) => console.log(err));
}
