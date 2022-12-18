/**
 * @license
 * Copyright Intenseloop LTD All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { EleganteError, ErrorCode, query } from '@elegante/sdk';

import { Request, Response } from 'express';
import { ServerParams } from './Server';

export function restDeleteMe({
  params,
}: {
  params: ServerParams;
}): (req: Request, res: Response) => void {
  return async (req, res) => {
    try {
      const { session } = res.locals ?? {};
      await query('Session').unlock(true).delete(session.objectId);
      return res.status(200).send();
    } catch (err) {
      return res
        .status(500)
        .json(new EleganteError(ErrorCode.AUTH_SIGN_OUT_ERROR, err as object));
    }
  };
}
