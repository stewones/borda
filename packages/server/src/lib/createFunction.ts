import { NextFunction, Request, Response } from 'express';
import { ElegServer } from './ElegServer';

export interface CloudFunctionOptions {
  isPublic?: boolean;
  path?: string;
  name: string;
}

export const handlePublicRoute =
  (options: CloudFunctionOptions) =>
  (req: Request, res: Response, next: NextFunction) => {
    const { unlocked } = res.locals;
    const { isPublic } = options;

    if (unlocked || isPublic) {
      return next();
    }

    /**
     * @todo
     * check for user session
     */
    return res.status(401).send('Unauthorized session');
  };

/**
 * Attach a function to Elegant Server
 *
 * - Cloud Functions can be public (i.e. no secret key is required to call them, api key is required still)
 * - Cloud Functions depends on your response to complete the http request call, so it's subject to timeouts
 * - Cloud Functions are suited for lighter tasks like registering emails, processing some data, etc
 *
 * functions are called via POST requests or via the Elegante SDK
 *
 * SDK
 *
 * import { createClient, runFunction } from '@elegante/sdk';
 *
 * createClient({ ... });
 *
 * await runFunction('sendEmail', { to: '...', subject: '...', body: '...' });
 *
 * POST
 *
 * curl --location --request POST 'http://localhost:3135/server/functions/some/inner/logic' \
 * --header 'X-Elegante-Api-Key: ELEGANTE_SERVER'
 *
 *
 * @export
 * @param {CloudFunctionOptions} options
 * @param {(req: Request, res: Response) => Promise<void>} fn
 */
export function createFunction(
  options: CloudFunctionOptions,
  fn: (req: Request, res: Response) => Promise<void>
): void {
  const { app } = ElegServer;
  app.post(
    `/functions/${options?.path ?? options.name}`,
    handlePublicRoute(options),
    async (req, res) => {
      console.time(`function duration: ${options.name}`);
      try {
        await fn(req, res);
        // @todo save statistic to db when we have Elegante Models
        console.timeEnd(`function duration: ${options.name}`);
      } catch (err) {
        res.status(500).send(err);
        console.timeEnd(`function duration: ${options.name}`);
        // @todo save statistic to db when we have Elegante Models
      }
    }
  );
}
