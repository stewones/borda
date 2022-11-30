import { ElegClient } from '../ElegClient';

export const log = (...args: unknown[]) =>
  ElegClient.params.debug ? console.debug('\x1b[33m%s\x1b[0m', ...args) : null;
