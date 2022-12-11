/* eslint-disable @typescript-eslint/no-explicit-any */
import watch from 'redux-watch';
import { Observable } from 'rxjs';
import { get, cloneDeep, LocalStorage } from '@elegante/sdk';
import { EleganteBrowser } from './Browser';
import { log } from './log';
import { $docsReset, $docsSet, $docsUnset, dispatch } from './redux';

export interface SetStateOptions {
  saveCache?: boolean;
}

export interface UnsetStateOptions {
  removeCache?: boolean;
}
export interface ResetStateOptions {
  eraseCache?: boolean;
}

export interface ListenerOptions {
  context: boolean;
  $docs: boolean;
  copy: boolean;
}

export interface StateContext<T = any> {
  path: string;
  prev: T;
  next: T;
}

/**
 * Synchronously grab a piece of data from state controlled by custom reducers.
 * The path is a string with dot notation. If path isn't specified, the whole state is returned.
 *
 * @export
 * @template T
 * @param {string} [path]
 * @returns {*}  {T}
 */
export function getState<T = any>(path?: string): T {
  if (!EleganteBrowser.store) {
    throw new Error(
      'unable to find any store. to use getState make sure to import { load } from @elegante/browser and call `load()` in your app before anything starts.'
    );
  }
  const currentState = EleganteBrowser.store.getState();
  if (path) {
    return get(currentState, path);
  }
  return currentState;
}

/**
 * Synchronously grab a piece of data from $docs state.
 * The key is a string, if not provided the whole $docs state is returned.
 *
 * @export
 * @template T
 * @param {string} [key]
 * @returns {*}  {T}
 */
export function getDocState<T = any>(key?: string): T {
  if (!EleganteBrowser.store) {
    throw new Error(
      'unable to find any store. to use getDocState make sure to import { load } from @elegante/browser and call `load()` in your app before anything starts.'
    );
  }

  const currentState = EleganteBrowser.store.getState();

  if (key) {
    return get(currentState, `$docs.${key}`);
  }
  return get(currentState, `$docs`);
}

export function setDocState(
  key: string,
  value: any,
  options: SetStateOptions = { saveCache: true }
) {
  dispatch(
    $docsSet({
      key,
      value,
    })
  );

  if (options.saveCache) {
    log('setDocState.cache', key, value);
    LocalStorage.set(key, value);
  }
}

export function unsetDocState(
  key: string,
  options: UnsetStateOptions = { removeCache: true }
) {
  dispatch(
    $docsUnset({
      key,
    })
  );
  if (options.removeCache) {
    LocalStorage.unset(key);
  }
}

export function resetDocsState() {
  dispatch($docsReset());
}

export function resetState(options: ResetStateOptions = { eraseCache: true }) {
  resetDocsState();
  if (options.eraseCache) {
    LocalStorage.clear();
  }
}

/**
 * Provides reactive data access to both $docs and custom reducers.
 * The path is a string with dot notation in case of custom reducers.
 * To use $docs, set the $docs option to true.
 *
 * The context option provides the previous and next value of the state.
 * This is useful if you want to know what changed in the state.
 *
 * The copy option makes a copy of the state. Default to false.
 *
 * @export
 * @template T
 * @param {string} path
 * @param {Partial<ListenerOptions>} [options={
 *     context: false,
 *     $docs: false,
 *     copy: false,
 *   }]
 * @returns {*}  {Observable<T>}
 */
export function listener<T = any>(
  this: any,
  path: string,
  options: Partial<ListenerOptions> = {
    $docs: false,
    context: false,
    copy: false,
  }
) {
  if (!EleganteBrowser.store) {
    throw new Error(
      'unable to find any store. to use listener make sure to import { load } from @elegante/browser and call `load()` in your app before anything starts.'
    );
  }

  if (options.$docs) {
    path = `$docs.${path}`;
  }

  // eslint-disable-next-line @typescript-eslint/no-this-alias
  const that = this;

  if (EleganteBrowser.debug && that && that.constructor) {
    if (!that.cdr) {
      throw new Error(
        'Unable to find ChangeDetectorRef in your component. If you want to make sure that your component reflects state changes automatically, make sure to import { ChangeDetectorRef } from @angular/core and instantiate it in your constructor as `private cdr: ChangeDetectorRef`'
      );
    }
  }

  const o = new Observable<T>((observer) => {
    const storeInstance = EleganteBrowser.store;
    const storeValue = options.copy
      ? cloneDeep(get(storeInstance.getState(), path))
      : get(storeInstance.getState(), path);

    /**
     * created the watcher
     */
    const w = watch(storeInstance.getState, path);

    /**
     * initial dispatch
     */
    if (options.context) {
      observer.next({
        path,
        prev: storeValue,
        next: storeValue,
      } as any);
    } else {
      observer.next(storeValue);
    }

    /**
     * subscribe to changes
     */
    storeInstance.subscribe(
      w((next, prev, path) => {
        const nextValue = options.copy ? cloneDeep(next) : next;
        // console.log(
        //   '%s changed from %s to %s at %s',
        //   path,
        //   JSON.stringify(prev),
        //   JSON.stringify(nextValue),
        //   new Date().toLocaleTimeString()
        // );

        if (options.context) {
          observer.next({
            path,
            prev,
            next: nextValue,
          } as any);
        } else {
          observer.next(nextValue);
        }

        if (that && that.cdr && that.cdr.detectChanges) {
          that.cdr.detectChanges();
        }
      })
    );
  });

  return o;
}
