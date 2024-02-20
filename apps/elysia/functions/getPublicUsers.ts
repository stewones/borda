import { borda } from '../';

export async function getPublicUsers() {
  return await borda
    .query('PublicUser')
    .unlock()
    .projection({
      name: 1,
      email: 1,
      createdAt: 1,
      objectId: 1,
    })
    .sort({ updatedAt: -1 })
    .limit(1000)
    .filter({
      expiresAt: {
        $exists: false,
      },
    })
    .find({
      allowDiskUse: true,
    });
}
