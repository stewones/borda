import { print, query } from '@elegante/sdk';
import { Cloud } from '@elegante/server';

Cloud.addFunction(
  'getCounter',
  {
    isPublic: true,
  },
  async ({ req, res }) => {
    print('executing', `getCounter`);
    try {
      let counter = await query('Counter')
        .unlock()
        .filter({
          name: {
            $eq: 'elegante',
          },
        })
        .findOne();

      if (!counter) {
        counter = await query('Counter').unlock().insert({
          total: 0,
          name: 'elegante',
        });
      }

      res.status(200).json(counter);
    } catch (err) {
      return res.status(400).send(err);
    }
  }
);

export function getCounter() {
  //
}
