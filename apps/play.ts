import { Borda } from '@borda/server';

const borda = new Borda({
  inspect: true,
  mongoURI: 'mongodb://127.0.0.1:27017/db',
});
await borda.server();

////////////////////////////////////////

runSomething();

////////////////////////////////////////

async function runSomething() {
  const something = await borda
    .query('Something')
    .include(['that', 'that.thing'])
    .filter({
      objectId: 'moQpkoz2T5',
    })
    .findOne({
      inspect: true,
    });
  console.log('✅ something', something);
}
