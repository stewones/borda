import { Request } from 'express';
import { EleganteServer } from './EleganteServer';
export interface CloudJobOptions {
  path?: string;
  name: string;
}

/**
 * Attach a Job to Elegant Server
 *
 * - Cloud Jobs can't be public (i.e. secret key is required to call them)
 * - Cloud Jobs run indefinitely until you return a value or throw an exception
 * - Cloud Jobs are suited for heavier tasks like sending emails, processing images, etc
 *
 * jobs are called via POST requests or via the Elegante SDK
 *
 * SDK (server only)
 *
 * import { createClient, runJob } from '@elegante/sdk';
 *
 * createClient({ ... });
 *
 * await runJob('sendEmail', { to: '...', subject: '...', body: '...' });
 *
 * POST
 *
 * curl --location --request POST 'http://localhost:1337/server/jobs/some/inner/task' \
 *   --header 'X-Elegante-Api-Key: ELEGANTE_SERVER' \
 *   --header 'X-Elegante-Secret-Key: ELEGANTE_SECRET'
 *
 *
 * @export
 * @param {CloudJobOptions} options
 * @param {((req: Request) => Promise<string | void>)} fn
 */
export function createJob(
  options: CloudJobOptions,
  fn: (req: Request) => Promise<string | void>
): void {
  const { app } = EleganteServer;
  app.post(`/jobs/${options?.path ?? options.name}`, async (req, res) => {
    console.time(`job duration: ${options.name}`);
    try {
      res.status(200).send('🚀');
      const r = await fn(req); // @todo save result to db when we have Elegante Models
      console.timeEnd(`job duration: ${options.name}`);
    } catch (err) {
      // @todo save error to db when we have Elegante Models
      res.status(500).send(err);
      console.timeEnd(`job duration: ${options.name}`);
    }
  });
}
