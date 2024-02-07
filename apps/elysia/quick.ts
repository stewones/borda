/**
 * Replace the content of the index.ts file with the content of this file
 */

import { Borda } from '@borda/server';

import { getCounter } from './functions/getCounter';
import {
  afterDeletePublicUser,
  afterSaveUser,
  beforeSaveUser,
  beforeSignUp,
} from './triggers';

export const borda = new Borda();

borda.cloud.beforeSignUp(beforeSignUp);
borda.cloud.beforeSave('User', beforeSaveUser);
borda.cloud.afterSave('User', afterSaveUser);
borda.cloud.afterDelete('PublicUser', afterDeletePublicUser);
borda.cloud.addFunction(getCounter, {
  public: true,
});

const app = await borda.server();
app.listen(1337);

console.log(
  `🦊 Borda is running at ${app.server?.hostname}:${app.server?.port}`
);
