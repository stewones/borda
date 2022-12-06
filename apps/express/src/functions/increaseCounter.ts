import { print, query } from '@elegante/sdk';
import { Cloud } from '@elegante/server';

Cloud.addFunction(
  'increaseCounter',
  {
    isPublic: true,
  },
  async ({ req, res }) => {
    print('executing', `increaseCounter`, req.body);
    try {
      const { objectId, total } = req.body;
      await query('Counter').unlock(true).update(objectId, {
        total,
      });
      res.status(200).send();
    } catch (err) {
      console.log(err);
      return res.status(400).send(err);
    }
  }
);
