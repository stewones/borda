import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { z } from 'zod';

import { Instant } from './Instant';

const schema = {
  messages: z.object({
    _id: z.string(),
    _created_at: z.string(),
    _updated_at: z.string(),
    text: z.string(),
  }),
};

const insta = new Instant({
  schema,
  name: 'MessageLoadTest',
  idb: indexedDB,
  idbKeyRange: IDBKeyRange,
});

const MESSAGE_COUNT = 50_000;

(async () => {
  const startTime = Date.now();
  console.time('Total execution time');
  console.log(`Loading ${MESSAGE_COUNT} messages sequentially...`);

  for (let i = 0; i < MESSAGE_COUNT; i++) {
    await insta.db.table('messages').add({
      _id: `msg${i}`,
      _created_at: new Date().toISOString(),
      _updated_at: new Date().toISOString(),
      text: `This is a message ${i}`,
    });
    console.log(`Added message ${i}`);
  }

  const endTime = Date.now();
  const totalTime = (endTime - startTime) / 1000; // in seconds

  console.log(`Total time taken: ${totalTime} seconds`);

  // Calculate DB size (this is an estimation, actual implementation may vary)
  const dbSize = (await insta.db.table('messages').count()) * 100; // Assuming average message size of 100 bytes

  console.log(`Estimated DB size: ${dbSize / (1024 * 1024)} MB`);
  console.timeEnd('Total execution time');
})();
