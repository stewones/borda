// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isEmpty(object: any) {
  for (const key in object) {
    // eslint-disable-next-line no-prototype-builtins
    if (object.hasOwnProperty(key)) {
      return false;
    }
  }
  return true;
}
