import { EleganteClient } from '../EleganteClient';

export const log = (...args: unknown[]) =>
  EleganteClient.params.debug ? print(...args) : undefined;

export const print = (...args: unknown[]) =>
  console.debug('\x1b[33m%s\x1b[0m', ...args);
