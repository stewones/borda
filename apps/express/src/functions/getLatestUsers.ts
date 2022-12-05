import { query } from '@elegante/sdk';
import { createFunction } from '@elegante/server';

createFunction(
  'getLatestUsers',
  {
    isPublic: true,
  },
  async (req, res) => {
    try {
      res.status(200).send(
        await query('User')
          .unlock(true)
          .projection({
            name: 1,
            email: 1,
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
