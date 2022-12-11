import { print } from '@elegante/sdk';
import { EleganteBrowser } from './Browser';

export const log = (...args: unknown[]) =>
  EleganteBrowser.debug ? print(...args) : undefined;
