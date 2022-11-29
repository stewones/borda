import { NextFunction, Request, Response } from 'express';
import { ElegServer } from './ElegServer';

export interface CloudFunctionOptions {
  isPublic?: boolean;
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

export function createFunction(
  route: string, // can be a express-like route
  fn: (req: Request, res: Response) => Promise<void>,
  options: CloudFunctionOptions = {}
): void {
  const { app } = ElegServer;
  app.post(
    `/functions/${route}`,
    handlePublicRoute(options),
    async (req, res) => {
      console.time(`function duration: ${route}`);
      try {
        await fn(req, res);
        // @todo save statistic to db when we have Elegante Models
        console.timeEnd(`function duration: ${route}`);
      } catch (err) {
        res.status(500).send(err);
        console.timeEnd(`function duration: ${route}`);
        // @todo save statistic to db when we have Elegante Models
      }
    }
  );
}
