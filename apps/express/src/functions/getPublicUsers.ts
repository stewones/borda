import { query } from '@elegante/sdk';
import { Cloud } from '@elegante/server';

Cloud.addFunction(
  'getPublicUsers',
  {
    public: true,
  },
  async ({ req, res }) => {
    try {
      res.status(200).send(
        await query('PublicUser')
          .unlock()
          .projection({
            name: 1,
            email: 1,
            createdAt: 1,
            objectId: 1,
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
