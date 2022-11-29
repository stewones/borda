import { Request, Response } from 'express';
import { EleganteServer } from './EleganteServer';

export function createFunction(
  route: string, // can be a express-like route
  fn: (req: Request, res: Response) => Promise<void>
): void {
  const { app } = EleganteServer;
  app.post(`/functions/${route}`, async (req, res) => {
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
  });
}
