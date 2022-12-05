import { delay, print } from '@elegante/sdk';
import { createJob } from '@elegante/server';

createJob(
  {
    name: 'someHeavyTask',
    path: 'some/inner/:routeParam', // not required
  },
  async (req) => {
    print('executing someHeavyTask', 'body', req.params.routeParam || {});
    await delay(10000);
    print('someHeavyTask done');
    return Promise.resolve('someHeavyTask done');
  }
);
