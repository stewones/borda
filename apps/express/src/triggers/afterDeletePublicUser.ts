import { Cloud } from '@elegante/server';
import { query } from '@elegante/sdk';

Cloud.afterDelete('PublicUser', ({ before }) => {
  query('User')
    .unlock()
    .filter({
      email: {
        $eq: before.email,
      },
    })
    .delete()
    .catch((err) => console.log(err));
});
