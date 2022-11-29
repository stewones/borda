import { Request } from 'express';
import { EleganteServer } from './EleganteServer';

export function createJob(
  name: string,
  fn: (req: Request) => Promise<string | void>
): void {
  const { app } = EleganteServer;
  app.post(`/jobs/${name}`, async (req, res) => {
    console.time(`job duration: ${name}`);
    try {
      res.status(200).send();
      const r = await fn(req); // @todo save result to db when we have Elegante Models
      console.timeEnd(`job duration: ${name}`);
    } catch (err) {
      // @todo save error to db when we have Elegante Models
      res.status(500).send(err);
      console.timeEnd(`job duration: ${name}`);
    }
  });
}
