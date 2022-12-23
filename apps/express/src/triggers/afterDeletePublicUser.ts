import { Cloud } from '@elegante/server';
import { query } from '@elegante/sdk';

Cloud.afterDelete('PublicUser', ({ doc }) => {
  query('User')
    .unlock()
    .filter({
      email: {
        $eq: doc.email,
      },
    })
    .delete()
    .catch((err) => console.log(err));
});
