import { delay } from '@elegante/sdk';
import { createFunction } from '@elegante/server';

createFunction(
  {
    name: 'someInnerPublicTask',
    path: 'some/inner/:routeParam', // not required
    isPublic: true, // <-- default to false. a session token must be sent to all /functions/* endpoints
  },
  async (req, res) => {
    console.log('executing', `some/inner/${req.params.routeParam}`);
    await delay(3000);
    console.log(`${req.params.routeParam} done`);
    res.status(200).send(`${req.params.routeParam} done`);
  }
);
