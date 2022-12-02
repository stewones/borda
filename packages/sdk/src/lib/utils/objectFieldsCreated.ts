/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * compare two objects and output the created fields
 */

export function objectFieldsCreated(before: any, after: any): any {
  const result: any = {};

  for (const key in after) {
    // eslint-disable-next-line no-prototype-builtins
    if (after.hasOwnProperty(key)) {
      if (!before[key]) {
        result[key] = after[key];
      }
    }
  }
  return result;
}
