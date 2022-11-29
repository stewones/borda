// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const stringify = (obj: any, options = { preseverKeys: false }) => {
  let log = '';
  for (const k in obj) {
    log += `${options.preseverKeys ? k + ': ' : ''}${obj[k]} `;
  }
  return log.trim();
};
