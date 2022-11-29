/**
 * create a delay using setTimeout
 * time is in milliseconds
 *
 * @export
 * @param {number} time
 * @returns {*}
 */
export function delay(time: number) {
  return new Promise(function (resolve) {
    setTimeout(resolve, time);
  });
}
