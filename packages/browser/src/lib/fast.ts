/* eslint-disable @typescript-eslint/no-explicit-any */
import 'reflect-metadata';

import { Document, LocalStorage, isEqual } from '@elegante/sdk';
import { Observable } from 'rxjs';
import { log } from './log';
import { EleganteBrowser } from './Browser';
import { getDocState, setDocState } from './state';
interface FastOptions {
  key: string;
}

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
 *               .filter({...})
 *               .sort({...})
 *               .find({...})
 *
 * you can make it work faster by using the `fast` decorator and subscribing to changes
 *
 * import { fast, from } from '@elegante/browser';
 *
 * const q = query('PublicUser')
 *               .limit(10)
 *               .filter({...})
 *               .sort({...})
 *               .find({...})
 *
 * fast(from(q)).subscribe(results)
 *
 * what's happening here?
 *
 * 1 - The query result is being cached in memory (redux state) and disk
 *     with an automatic key based on the query parameters
 * 2 - The query always try to deliver what's faster first (memory or cache)
 *     and then if network result differs from the cached one
 *     it will update the stored data and make a second delivery in the same rxjs stream
 *

 * // using an existing promise
 *
 * const p = new Promise((resolve, reject) => {
 *   setTimeout(() => {
 *     resolve('hello world')
 *   }, 1000)
 * })
 *
 * fast(from(p)).subscribe(console.log) // this is wrong
 *
 * // since this isn't an elegant query and the snipet above has no key
 * // we need to set a key if we want the result to be cached
 * fast('my-key', p).subscribe(console.log)
 *
 * // using an existing observable
 * const o = new Observable((observer) => {
 *   setTimeout(() => {
 *     observer.next('hello world')
 *   }, 1000)
 * })
 *
 * fast(o).subscribe(console.log) // this is wrong
 *
 * // same for pre-made observables, since the snipet above has no key, we need to set one
 * fast('my-key', o).subscribe(console.log)
 *
 * @export
 */
export function fast<T = Document>(source: Observable<T>): Observable<T>;
export function fast<T = Document>(
  key: string,
  source: Observable<T>
): Observable<T>;
export function fast<T = Document>(
  source: Observable<T>,
  options: FastOptions
): Observable<T>;
export function fast<T = Document>(
  source: any,
  options: any = {
    key: '',
  }
): Observable<T> {
  let _source: Observable<T> | null = null;
  let _options: FastOptions = {} as FastOptions;

  if (source && source instanceof Observable) {
    _source = source;
  }

  if (options && typeof options === 'object') {
    _options = options;
  }

  if (typeof source === 'string' && options && options instanceof Observable) {
    _source = options;
    _options = {
      ..._options,
      key: source,
    };
  }

  if (!_source) {
    throw new Error(
      'Invalid source, please provide a valid Observable as a source. You can use the `from` function to convert a promise or a query into an Observable.'
    );
  }

  return memorize(_source, _options);
}

/**
 * Fast decorator for Typescript nerds 🤓
 *
 * @example
 *
 * ## Angular pipe async example with promise
 *
 * import { Fast, from } from '@elegante/browser';
 *
 * @Component(
 *  template: `{{ myUsersList$ | async | json }}`
 * )
 * class User {
 *    @Fast('latest-users') myUsersList$ = from(getUsersPromise());
 * }
 *
 * // Angular pipe async example with elegante queries has no need of a key
 * // unless you want to customize it with your own
 *
 * class User {
 *    @Fast() myUsersList$ = from(getUsersPromise());
 * }
 *
 *
 */
export function Fast(key?: string): (target: any, propertyKey: string) => void;
export function Fast(
  options?: FastOptions
): (target: any, propertyKey: string) => void;
export function Fast(
  key?: string,
  options?: FastOptions
): (target: any, propertyKey: string) => void;
export function Fast(key?: any, options?: any) {
  let _key = '';
  let _options: FastOptions = {} as FastOptions;

  if (key && typeof key === 'string') {
    _key = key;
    _options = {
      ..._options,
      key: _key,
    };
  }

  if (options && typeof options === 'object') {
    _options = { ..._options, ...options };
  }

  if (typeof key === 'object' && !options) {
    _options = key;
  }

  if (typeof key === 'string' && options && typeof options === 'object') {
    _options = { ..._options, ...options, key };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <T = Document>(target: any, propertyKey: string) => {
    let value: Observable<T>;

    Object.defineProperty(target, propertyKey, {
      get: () => value,
      set: (newValue) => (value = fast(newValue, _options)),
    });
  };
}

function memorize<T>(source: Observable<T>, options: FastOptions) {
  if (!EleganteBrowser.store) {
    throw new Error(
      'unable to find any store. to use the fast decorator make sure to import { load } from @elegante/browser and call `load()` in your app before anything starts.'
    );
  }

  const key = options.key || Reflect.getMetadata('key', source);

  if (!key) {
    throw new Error(
      'A key need to be provided in order to make your source Fast'
    );
  }

  return new Observable((observer) => {
    const state = getDocState(key);
    const cache = LocalStorage.get(key);

    if (state) {
      log('state.get', key, cache);
      observer.next(state);
    } else if (cache) {
      log('cache.get', key, cache);
      observer.next(cache);
    }

    source.subscribe({
      next: (current) => {
        if (!state || !cache || !isEqual(state, cache)) {
          observer.next(current);
        }

        if (state) {
          log(
            'state.status',
            key,
            'isEqual',
            isEqual(state, current),
            'state',
            state,
            'current',
            current
          );
        } else if (cache) {
          log(
            'cache.status',
            key,
            'isEqual',
            isEqual(cache, current),
            'cache',
            cache,
            'current',
            current
          );
        }

        if (!isEqual(cache, current)) {
          LocalStorage.set(key, current);
          log('cache.set', key, current);
        }

        if (!isEqual(state, current)) {
          setDocState(key, current, { saveCache: false });
          log('state.set', key, current);
        }
      },
      error: (error) => observer.error(error),
    });
  }) as Observable<T>;
}
