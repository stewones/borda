import { isServer } from './isServer';

export function isOnline() {
  return !isServer() && navigator && navigator.onLine;
}
