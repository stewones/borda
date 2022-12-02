// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isUnlocked(locals: any) {
  return locals && locals['unlocked'] ? true : false;
}
