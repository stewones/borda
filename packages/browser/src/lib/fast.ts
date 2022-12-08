/* eslint-disable @typescript-eslint/no-explicit-any */
import { query, Query } from '@elegante/sdk';
import { Observable, of } from 'rxjs';

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
 *               .method('find', {...}) // <-- notice the method, this is the only difference to make it work fast in an elegant way ;)
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
export function fast<T = any>(
  source: Observable<T> | Promise<T> | Query<T>,
  options: { key: string } = {
    key: '',
  }
): Observable<T> {
  // eslint-disable-next-line no-prototype-builtins
  if (typeof source === 'object' && source.hasOwnProperty('qrl')) {
    const q: Query<T> = source as Query<T>;

    console.log('oh wow, this is an elegante query', source);
    return of(q.qrl() as T);
    // return source.pipe(
    //   tap((data) => {
    //     if (data instanceof Query) {
    //       data.cache();
    //     }
    //   })
    // );
  }

  if (!options.key) {
    throw new Error(
      'fast decorator requires a key to cache the data coming from Promises or Observables'
    );
  }

  if (source instanceof Observable) {
    console.log('oh wow, this is an observable', source);
    // return of()
    // return source.pipe(
    //   tap((data) => {

    //         // data.cache();

    //   })
    // );
  }

  if (source instanceof Promise) {
    console.log('oh wow, this is a promise', source);
    return of();
    // return from(source).pipe(
    //   tap((data) => {
    //      // data.cache();
    //      console.log('oh wow, this is a promise', data)
    //   })
    // );
  }

  throw new Error(
    'fast decorator only accepts Observable, Promise or Elegante Query'
  );
}
