import { Response } from 'express';

import { Document, QueryMethod } from '@elegante/sdk';

import { isUnlocked } from '../utils/isUnlocked';
import { parseDoc, parseDocs } from './parseDoc';
import { parseProjection } from './parseProjection';
import { DocQRL } from './parseQuery';
import { createFindCursor, ServerParams } from './Server';

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
  /**
   * apply a hard limit if not set and only *if* locals env is not unlocked
   * also ensures that the limit being passed is not greater than the max one defined in the server instance
   */
  const maxDocsPerQuery = params.queryMaxDocLimit ?? 50;

  if (!docQRL.limit && !isUnlocked(res.locals)) {
    docQRL.limit = maxDocsPerQuery;
  } else if (
    docQRL.limit &&
    docQRL.limit > maxDocsPerQuery &&
    !isUnlocked(res.locals)
  ) {
    docQRL.limit = maxDocsPerQuery;
  }

  /**
   * all good to proceed with the query
   */
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
