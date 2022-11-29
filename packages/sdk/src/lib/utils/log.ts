export const log = (...args: unknown[]) =>
  console.log('\x1b[33m%s\x1b[0m', ...args);
