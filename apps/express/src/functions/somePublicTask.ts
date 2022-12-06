import { delay, print, runFunction } from '@elegante/sdk';
import { Cloud } from '@elegante/server';

/**
 * function example to show how to create a public function
 * this function is automatically executed with the server
 * refer to the IIFE at the bottom of this file
 */
Cloud.addFunction(
  'somePublicTask',
  {
    /**
     * default to false. a session token must be sent to all /functions/* endpoints
     * experiment commenting out the following line and see console output
     */
    isPublic: true,
  },
  async ({ req, res }) => {
    print('executing', `somePublicTask`, req.body);
    await delay(3000);
    print(`somePublicTask done`);
    res.status(200).send(`somePublicTask done`);
  }
);

(async () => {
  await delay(100);
  print('executing somePublicTask function in 5 seconds');
  await delay(5000);
  /**
   * there's also the `runFunction` which is a standalone function
   * it can be imported via the elagante sdk to run cross-platform
   * experiment removing `Cloud.` from the following call and see console output
   * it should behave the same as it's just a wrapper around `runFunction`
   */
  Cloud.runFunction('somePublicTask', {
    somePayload: `Look Im A Payload`,
  }).catch(print);
})();
