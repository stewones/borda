/* eslint-disable @typescript-eslint/no-explicit-any */
export function cleanArray(arr: any[]) {
  return arr.filter((element) => {
    if (Object.keys(element).length !== 0) {
      return true;
    }
    return false;
  });
}
