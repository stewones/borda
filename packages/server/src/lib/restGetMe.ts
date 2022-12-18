/**
 * @license
 * Copyright Intenseloop LTD All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

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
