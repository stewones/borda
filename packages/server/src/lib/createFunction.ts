import { NextFunction, Request, Response } from 'express';
import { EleganteServer } from './EleganteServer';
import {
  CloudFunctionOptions,
  Document,
  EleganteClient,
  EleganteError,
  ErrorCode,
} from '@elegante/sdk';

// export const CloudFunction: CloudFunctionProtocol = new Map();

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
 * curl --location --request POST 'http://localhost:1337/server/functions/some/inner/logic' \
 * --header 'X-Elegante-Api-Key: ELEGANTE_SERVER'
 *
 *
 * @export
 * @param {CloudFunctionOptions} options
 * @param {(req: Request, res: Response) => Promise<void>} fn
 */
export function createFunction(
  name: string,
  options: CloudFunctionOptions,
  fn: (req: Request, res: Response) => Promise<Document | Document[] | void>
): void {
  const { app, params } = EleganteServer;
  app.post(
    `/functions/${name}`,
    handlePublicRoute(options),
    async (req, res) => {
      if (EleganteClient.params.debug) {
        console.time(`function duration: ${name}`);
      }
      try {
        await fn(req, res);
        // @todo save statistic to db when we have Elegante Models
        if (EleganteClient.params.debug) {
          console.timeEnd(`function duration: ${name}`);
        }
      } catch (err) {
        res.status(500).send(err);
        if (EleganteClient.params.debug) {
          console.timeEnd(`function duration: ${name}`);
        }
        // @todo save statistic to db when we have Elegante Models
      }
    }
  );
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
    return res
      .status(401)
      .send(new EleganteError(ErrorCode.UNAUTHORIZED, 'Unauthorized'));
  };
