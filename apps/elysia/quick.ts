/**
 * Replace the content of the index.ts file with the content of this file
 */

import { Elysia } from 'elysia';

import { Borda } from '@borda/server';

import { cors } from '@elysiajs/cors';

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

const app = new Elysia();
app.use(await borda.server());
app.use(cors());
app.get('/', () => 'Hello World');
app.listen(1337);

console.log(
  `🦊 Borda is running at http://${app.server?.hostname}:${app.server?.port}`
);


