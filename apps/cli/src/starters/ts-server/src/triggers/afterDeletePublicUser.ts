import { query } from '@elegante/sdk';
import { Cloud } from '@elegante/server';

Cloud.afterDelete('PublicUser', ({ doc }) => {
  query('User')
    .unlock()
    .filter({
      email: {
        $eq: doc?.email,
      },
    })
    .delete()
    .catch((err) => console.log(err));
});
