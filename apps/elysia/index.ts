import { Elysia } from 'elysia';

import {
  Borda,
  memoryUsage,
  Version,
} from '@borda/server';

const borda = new Borda({
  name: 'borda-on-elysia',
  inspect: true,
});

const app = new Elysia()
  .use(borda.server())
  .get('/', () => 'Hello Elysia')
  .listen(1337);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);

borda.on.databaseConnect.subscribe(async ({ db, name }) => {
  const stats = await db.stats();
  console.log(
    `💽 Borda v${Version} is connected to the database ${stats['db']} from ${name}`
  );

  delete stats['$clusterTime'];
  delete stats['operationTime'];

  console.table(stats);
  console.timeEnd('startup');
  console.time('ping');

  await borda
    .ping()
    .then(() => {
      console.timeEnd('ping');
      console.log('🧠 memory', memoryUsage());
    })
    .catch((err) => console.log(err));

  // insert
  await borda
    .query('User')
    .insert({
      name: 'John',
      age: 30,
    })
    .then((user) => console.log('new user', user))
    .catch((err) => console.log(err));

  // find
  await borda
    .query('User')
    .find()
    .then((users) => console.log('users', users))
    .catch((err) => console.log(err));

  // findOne
  // ...
});

// iife
// (async () => {
//   const borda = new Borda({
//     params: {
//       name: 'borda-standalone',
//       inspect: true,
//     },
//   });
//   const app = await borda.server();
//   app.listen(1337);
//   console.log(
//     `Borda standalone is running at ${app.server?.hostname}:${app.server?.port}`
//   );
// })();
