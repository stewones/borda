import { Response } from 'express';

import { DocQRL } from './parseQuery';

export async function restPostCount({
  res,
  docQRL,
}: {
  res: Response;
  docQRL: DocQRL;
}) {
  const { filter, collection$ } = docQRL;
  return res.status(200).json(await collection$.countDocuments(filter || {}));
}
