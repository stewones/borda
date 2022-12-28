import { isServer } from './isServer';

export function guid(size = -1) {
  return isServer() || process.env['NODE_ENV'] === 'test'
    ? generateForServer(size)
    : generateForClient(size);
}

function generateForClient(size: number) {
  const uid = crypto.randomUUID();
  return size > 0 && size < 5 ? uid.split('-').slice(0, size).join('') : uid;
}

function generateForServer(size: number) {
  const uid = randomUUID();
  return size > 0 && size < 5 ? uid.split('-').slice(0, size).join('') : uid;
}

function random() {
  return Math.floor((1 + Math.random()) * 0x10000)
    .toString(16)
    .substring(1);
}

function randomUUID() {
  return (
    random() +
    random() +
    '-' +
    random() +
    '-' +
    random() +
    '-' +
    random() +
    '-' +
    random() +
    random() +
    random()
  );
}
