import { Request, Response } from 'express';
import { ServerParams } from './Server';
import { parseResponse } from './parseResponse';

export function restGetMe({
  params,
}: {
  params: ServerParams;
}): (req: Request, res: Response) => void {
  return async (req: Request, res: Response) =>
    res.status(200).json(
      parseResponse(res.locals['session'], {
        removeSensitiveFields: true,
      })
    );
}
