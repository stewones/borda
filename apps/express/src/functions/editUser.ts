import { print, query } from '@elegante/sdk';
import { Cloud } from '@elegante/server';

Cloud.addFunction(
  'editUser',
  {
    isPublic: true,
  },
  async ({ req, res }) => {
    print('executing', `deleteUser`);
    try {
      res
        .status(200)
        .send(
          await query('User').unlock(true).update(req.body.objectId, req.body)
        );
    } catch (err) {
      return res.status(400).send(err);
    }
  }
);
