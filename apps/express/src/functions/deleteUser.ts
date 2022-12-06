import { print, query } from '@elegante/sdk';
import { Cloud } from '@elegante/server';

Cloud.addFunction(
  'deleteUser',
  {
    isPublic: true,
  },
  async ({ req, res }) => {
    print('executing', `deleteUser`);
    try {
      res
        .status(200)
        .send(await query('User').unlock(true).delete(req.body.objectId));
    } catch (err) {
      return res.status(400).send(err);
    }
  }
);
