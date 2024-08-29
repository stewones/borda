import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { z } from 'zod';

import { Instant } from '../../../client/src/lib/Instant';

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
const BATCH_SIZE = 50; // Adjust this value based on performance

(async () => {
  const startTime = Date.now();

  console.time('Total execution time');
  console.log('Loading 50k messages in batches...');

  const now = new Date().toISOString();

  for (let i = 0; i < MESSAGE_COUNT; i += BATCH_SIZE) {
    const batch = Array.from({ length: BATCH_SIZE }, (_, j) => ({
      _id: `msg${i + j}`,
      _created_at: now,
      _updated_at: now,
      text: `This is a message ${i + j}`,
    }));

    console.log(`Adding batch ${i} to ${i + BATCH_SIZE}`);
    await insta.db.table('messages').bulkAdd(batch);
  }

  const endTime = Date.now();
  const totalTime = (endTime - startTime) / 1000; // in seconds

  console.log(`Total time taken: ${totalTime} seconds`);

  // Calculate DB size (this is an estimation, actual implementation may vary)
  const dbSize = (await insta.db.table('messages').count()) * 100; // Assuming average message size of 100 bytes

  console.log(`Estimated DB size: ${dbSize / (1024 * 1024)} MB`);
  console.timeEnd('Total execution time');
})();
