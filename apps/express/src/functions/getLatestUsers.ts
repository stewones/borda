import { query } from '@elegante/sdk';
import { Cloud } from '@elegante/server';

Cloud.addFunction(
  'getLatestUsers',
  {
    isPublic: true,
  },
  async ({ req, res }) => {
    const { session } = res.locals;
    //console.log(session);
    try {
      res.status(200).send(
        await query('PublicUser')
          .unlock(true)
          .projection({
            name: 1,
            email: 1,
            createdAt: 1,
          })
          .sort({ updatedAt: -1 })
          .limit(5)
          .find({
            allowDiskUse: true,
          })
      );
    } catch (err) {
      return res.status(400).send(err);
    }
  }
);
