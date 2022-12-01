import { ExternalCollectionName } from '../internal';

export function getPointer(value: string) {
  const explode = value.split('$');
  const collection = ExternalCollectionName[explode[0]] ?? explode[0];
  const objectId = explode[1];
  return {
    collection,
    objectId,
  };
}
