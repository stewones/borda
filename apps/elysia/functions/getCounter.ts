import { isEmpty } from '@borda/client';

import { borda } from '../';

export async function getCounter() {
  if (borda.inspect) {
    console.log('executing cloud function getCounter');
  }

  // note the the borda instance here is the one exported
  // after initialization in the index.ts file
  // it means direct access to the mongo driver and unrestricted access

  let counter = await borda
    .query('Counter')
    .filter({
      name: {
        $eq: 'borda',
      },
    })
    .findOne({
      // force inspection per query
      inspect: false,
    });

  if (isEmpty(counter)) {
    counter = await borda.query('Counter').insert({
      total: 0,
      name: 'borda',
    });
  } 

  return counter;
}
