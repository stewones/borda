import { delay, print } from '@elegante/sdk';
import { Cloud } from '@elegante/server';

Cloud.addJob('someHeavyTask', async ({ req }) => {
  print('executing someHeavyTask', 'body', req.params.routeParam || {});
  await delay(10000);
  print('someHeavyTask done');
  return Promise.resolve('someHeavyTask done');
});
