import { borda } from '../';

export async function increaseCounter({
  body,
}: {
  body: { objectId: string; total: number };
}) {
  if (borda.inspect) {
    console.log('executing', 'increaseCounter', body);
  }

  const { objectId, total } = body;
  return await borda.query('Counter').unlock().update(objectId, {
    total,
  });
}
