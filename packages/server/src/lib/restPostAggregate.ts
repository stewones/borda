import { Response } from 'express';

import {
  AggregateOptions,
  Document,
  log,
} from '@elegante/sdk';

import {
  parseDoc,
  parseDocs,
} from './parseDoc';
import { parseProjection } from './parseProjection';
import { DocQRL } from './parseQuery';
import {
  createPipeline,
  ServerParams,
} from './Server';

export async function restPostAggregate({
  res,
  params,
  docQRL,
}: {
  res: Response;
  docQRL: DocQRL;
  params: ServerParams;
}) {
  const { collection$, pipeline, filter, limit, skip, sort, options } = docQRL;

  const docs: Document[] = [];
  const pipe = createPipeline<Document>({
    filter: filter ?? {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pipeline: pipeline ?? ([] as any),
    limit: limit ?? 10000,
    skip: skip ?? 0,
    sort: sort ?? {},
  });

  log('pipeline', JSON.stringify(pipe));

  const cursor = collection$.aggregate<Document>(
    pipe,
    options as AggregateOptions
  );

  for await (const doc of cursor) {
    docs.push(doc);
  }

  return res.status(200).json(
    Array.isArray(docs)
      ? parseProjection(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          docQRL.projection ?? ({} as any),
          await parseDocs(docs)(docQRL, params, res.locals)
        ) ?? []
      : parseProjection(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          docQRL.projection ?? ({} as any),
          await parseDoc(docs)(docQRL, params, res.locals)
        )
  );
}
