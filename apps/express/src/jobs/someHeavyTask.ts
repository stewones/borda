import { delay } from '@elegante/sdk';
import { createJob } from '@elegante/server';

createJob(
  {
    name: 'someHeavyTask',
    path: 'some/inner/:routeParam', // not required
  },
  async (req) => {
    console.log('executing someHeavyTask', 'body', req.params.routeParam || {});
    await delay(10000);
    console.log('someHeavyTask done');
    return Promise.resolve('someHeavyTask done');
  }
);
