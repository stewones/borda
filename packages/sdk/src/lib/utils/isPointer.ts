/* eslint-disable @typescript-eslint/no-explicit-any */
export function isPointer(value: any) {
  return (
    typeof value === 'string' &&
    value.includes('$') &&
    !value.startsWith('$') &&
    !value.endsWith('$')
  );
}
