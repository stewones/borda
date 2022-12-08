/**
 * The `fast` decorator is a wrapper used around any source of data
 * leveraging memory and disk cache to make it react "fast" to network changes
 *
 * @example
 *
 * given a source of data like this:
 *
 * const q = query('PublicUser')
 *               .limit(10)
 *               .filter()
 *               .sort()
 *               .find({...})
 *
 * you can make it work faster by using the `fast` decorator and subscribing to changes
 *
 * import { fast } from '@elegante/browser';
 *
 * const q = query('PublicUser')
 *               .limit(10)
 *               .filter()
 *               .sort()
 *               .run('find', {...}) // <-- notice the run method, this is the only difference to make it work `fast`
 *
 * fast(q).subscribe(results)
 *
 * what's happening here?
 *
 * 1 - The query result is being cached in memory (redux state) and disk
 * 2 - The query will always try to deliver what's faster first (memory or cache)
 *     and then if network result differs from the cached one
 *     it will update the cache and make a second delivery in the same rxjs stream
 *
 * more examples:
 *
 * // using an existing promise
 *
 * const p = new Promise((resolve, reject) => {
 *   setTimeout(() => {
 *     resolve('hello world')
 *   }, 1000)
 * })
 *
 * fast(p).subscribe(console.log)
 *
 * // using an existing observable
 *
 * const o = new Observable((observer) => {
 *   setTimeout(() => {
 *     observer.next('hello world')
 *   }, 1000)
 * })
 *
 * fast(o).subscribe(console.log)
 *
 * @export
 */
export function fast() {}
