import { Elysia } from 'elysia';

import { Borda, memoryUsage, Version } from '@borda/server';

const borda = new Borda({
  params: {
    name: 'borda-elysia',
    inspect: true,
  },
});

const app = new Elysia()
  .use(borda.server())
  .get('/', () => 'Hello Elysia')
  .listen(1337);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);

Borda.onDatabaseConnect.subscribe(async ({ db, name }) => {
  const stats = await db.stats();
  Borda.print(
    `💽 Borda v${Version} is connected to the database ${stats['db']} from ${name}`
  );

  delete stats['$clusterTime'];
  delete stats['operationTime'];

  console.table(stats);
  console.timeEnd('startup');
  console.time('ping');

  borda
    .ping()
    .then(() => {
      console.timeEnd('ping');
      console.log('memory', memoryUsage());
    })
    .catch((err) => Borda.print(err));
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
