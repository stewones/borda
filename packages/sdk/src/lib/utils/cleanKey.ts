import { isEmpty } from './isEmpty';

/**
 * should remove irrelevant chars from the json string
 * - remove { }, [ ], " " from the final json string
 */
export function cleanKey(json: any): string {
  for (const key in json) {
    if (isEmpty(json[key])) {
      delete json[key];
    }
  }

  return (
    JSON.stringify(json)
      // eslint-disable-next-line no-useless-escape
      .replace(/[\{\}\[\]"]/g, '')
      .replace(/,/g, '.')
  );
}
