import { Response } from 'express';

import {
  Document,
  DocumentResponse,
  QueryMethod,
} from '@borda/sdk';

import {
  isUnlocked,
} from '../utils/isUnlocked'; // @todo replace with the request.unlocked
import { createFindCursor } from './mongodb';
import {
  DocQRL,
  parseDoc,
  parseDocs,
  parseProjection,
} from './parse';

// @todo reuse the server function but with the customization for the rest
// this should be the foundation from now on
export async function restPostFind({
  docQRL,
  res,
  method,
  queryLimit,
}: {
  docQRL: DocQRL;
  res: Response;
  method: QueryMethod;
  queryLimit: number;
}) {
  /**
   * apply a hard limit if not set and only *if* locals env is not unlocked
   * also ensures that the limit being passed is not greater than the max one defined in the server instance
   */
  const maxDocsPerQuery = queryLimit ?? 50;

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
          (await parseDoc(docs[0])(docQRL)) ?? {}
        )
      : parseProjection(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          docQRL.projection ?? ({} as any),
          await parseDocs(docs)(docQRL)
        ) ?? []
  );
}

export async function serverPostFind<TSchema = Document>({
  docQRL,
  method,
  inspect,
}: {
  docQRL: DocQRL;
  method: QueryMethod;
  inspect: boolean;
}) {
  const docs: Document[] = [];
  const cursor = createFindCursor(docQRL);

  await cursor.forEach((doc) => {
    docs.push(doc);
  });

  return (
    method === 'findOne'
      ? parseProjection(
          docQRL.projection ?? ({} as any),
          (await parseDoc({ obj: docs[0], inspect, isUnlocked: true })(
            docQRL
          )) ?? {}
        )
      : parseProjection(
          docQRL.projection ?? ({} as any),
          await parseDocs({ arr: docs, inspect, isUnlocked: true })(docQRL)
        ) ?? []
  ) as DocumentResponse<TSchema>;
}
