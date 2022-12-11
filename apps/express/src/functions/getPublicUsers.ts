import { query } from '@elegante/sdk';
import { Cloud } from '@elegante/server';

Cloud.addFunction(
  'getPublicUsers',
  {
    isPublic: true,
  },
  async ({ req, res }) => {
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
          .limit(1000)
          .filter({
            expiresAt: {
              $exists: false,
            },
          })
          .find({
            allowDiskUse: true,
          })
      );
    } catch (err) {
      return res.status(400).send(err);
    }
  }
);
