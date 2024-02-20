import { isServer } from './isServer';

export async function storageEstimate(): Promise<{
  percentageAvailable: number;
  percentageUsed: number;
  remainingMB: number;
  usedMB: number;
}> {
  let percentageAvailable = 0;
  let remainingMB = 0;
  let percentageUsed = 0;
  let usedMB = 0;

  if (!isServer() && navigator.storage && navigator.storage.estimate) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quota: any = await navigator.storage.estimate();

    // quota.usage -> Number of bytes used.
    // quota.quota -> Maximum number of bytes available.

    percentageUsed = (quota.usage / quota.quota) * 100;

    const remaining = quota.quota - quota.usage;

    // convert remaining to MB
    remainingMB = remaining / 1024 / 1024;
    usedMB = quota.usage / 1024 / 1024;

    // convert to percentage available
    percentageAvailable = 100 - percentageUsed;

    return {
      percentageUsed: parseFloat(percentageUsed.toFixed(2)),
      percentageAvailable: parseFloat(percentageAvailable.toFixed(2)),
      remainingMB,
      usedMB,
    };
  }

  return {
    percentageAvailable,
    percentageUsed,
    remainingMB,
    usedMB,
  };
}
