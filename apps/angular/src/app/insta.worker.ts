/// <reference lib="webworker" />

import { insta } from './borda';

addEventListener('message', async ({ data }) => {
  try {
    const { url } = JSON.parse(data);
    const perf = performance.now();

    /**
     * run the worker, it should:
     * 1. fetch filtered and paginated data from the server
     * 2. update the local indexedDB
     * 3. keep syncing older and new data in background
     *
     * 🎉 the ui can just query against the local db instead
     * including realtime updates via dexie livequery
     */
    const { collection, activity, synced } = await insta.runWorker({ url });

    if (insta.inspect) {
      const syncDuration = performance.now() - perf;
      const usage = await insta.usage(collection);
      console.log(
        `💨 sync ${syncDuration.toFixed(2)}ms`,
        collection,
        activity,
        synced
      );
      console.log('💾 estimated usage for', collection, usage);
    }

    // not needed for now
    // postMessage(JSON.stringify({ collection, page, synced }));
  } catch (err) {
    if (insta.inspect) {
      console.error('Error running worker', err);
    }
  }
});
