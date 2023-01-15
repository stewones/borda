import { Response } from 'express';

import {
  Document,
  QueryMethod,
} from '@elegante/sdk';

import {
  parseDoc,
  parseDocs,
} from './parseDoc';
import { parseProjection } from './parseProjection';
import { DocQRL } from './parseQuery';
import {
  createFindCursor,
  ServerParams,
} from './Server';

export async function restPostFind({
  docQRL,
  res,
  method,
  params,
}: {
  docQRL: DocQRL;
  res: Response;
  method: QueryMethod;
  params: ServerParams;
}) {
  const docs: Document[] = [];
  const cursor = createFindCursor(docQRL);
  await cursor.forEach((doc) => {
    docs.push(doc);
  });
  return res.status(200).json(
    method === 'findOne'
      ? parseProjection(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          docQRL.projection ?? ({} as any),
          (await parseDoc(docs[0])(docQRL, params, res.locals)) ?? {}
        )
      : parseProjection(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          docQRL.projection ?? ({} as any),
          await parseDocs(docs)(docQRL, params, res.locals)
        ) ?? []
  );
}
