/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

import watch from 'redux-watch';
import { Observable } from 'rxjs';

import {
  cloneDeep,
  Document,
  get,
  LocalStorage,
} from '@elegante/sdk';

import { EleganteBrowser } from './Browser';
import { log } from './log';
import {
  $docReset,
  $docSet,
  $docUnset,
  dispatch,
} from './redux';

export interface SetStateOptions {
  persist?: boolean;
}

export interface UnsetStateOptions {
  removeCache?: boolean;
}
export interface ResetStateOptions {
  clearLocalStorage?: boolean;
}

export interface ListenerOptions {
  context: boolean;
  $doc: boolean;
  copy: boolean;
}

export interface StateContext<T = Document> {
  path: string;
  prev: T;
  next: T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type StateDocument = Document | Document[] | string | number | any;

/**
 * Synchronously grab a piece of data from state controlled by custom reducers.
 * The path is a string with dot notation. If path isn't specified, the whole state is returned.
 *
 * @export
 * @template T
 * @param {string} [path]
 * @returns {*}  {T}
 */
export function getState<T = StateDocument>(path?: string): T {
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
 * Synchronously grab a piece of data from $doc state.
 * The key is a string, if not provided the whole $doc state is returned.
 *
 * @export
 * @template T
 * @param {string} [key]
 * @returns {*}  {T}
 */
export function getDocState<T = StateDocument>(key?: string): T {
  if (!EleganteBrowser.store) {
    throw new Error(
      'unable to find any store. to use getDocState make sure to import { load } from @elegante/browser and call `load()` in your app before anything starts.'
    );
  }

  const currentState = EleganteBrowser.store.getState();

  if (key) {
    return get(currentState, '$doc')[key];
  }
  return get(currentState, '$doc');
}

export function setDocState<T = StateDocument>(
  key: string,
  value: T,
  options: SetStateOptions = { persist: true }
) {
  if (!EleganteBrowser.store) {
    throw new Error(
      'unable to find any store. to use setDocState make sure to import { load } from @elegante/browser and call `load()` in your app before anything starts.'
    );
  }

  dispatch(
    $docSet({
      key,
      value,
    })
  );

  if (options.persist) {
    log('setDocState.cache', key, value);
    LocalStorage.set(key, value);
  }
}

export function unsetDocState(
  key: string,
  options: UnsetStateOptions = { removeCache: true }
) {
  if (!EleganteBrowser.store) {
    throw new Error(
      'unable to find any store. to use unsetDocState make sure to import { load } from @elegante/browser and call `load()` in your app before anything starts.'
    );
  }
  dispatch(
    $docUnset({
      key,
    })
  );
  if (options.removeCache) {
    LocalStorage.unset(key);
  }
}

/**
 * Reset all $doc state and optionally clear all local storage (default: true)
 * To reset custom reducers, you must implement your own reset action and `dispatch(myResetAction())`
 */
export function resetDocState(
  options: ResetStateOptions = { clearLocalStorage: true }
) {
  if (!EleganteBrowser.store) {
    throw new Error(
      'unable to find any store. to use resetDocState make sure to import { load } from @elegante/browser and call `load()` in your app before anything starts.'
    );
  }

  dispatch($docReset());
  if (options.clearLocalStorage) {
    LocalStorage.clear();
  }
}

/**
 * Provides reactive data access to both $doc and custom reducers.
 * The path is a string with dot notation in case of custom reducers.
 * To use $doc, set the $doc option to true.
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
 *     $doc: false,
 *     copy: false,
 *   }]
 * @returns {*}  {Observable<T>}
 */
export function connect<T = Document>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  this: any,
  path: string,
  options: Partial<ListenerOptions> = {
    context: false,
    $doc: false,
    copy: false,
  }
): Observable<T> {
  if (!EleganteBrowser.store) {
    throw new Error(
      'unable to find any store. to use connect make sure to import { load } from @elegante/browser and call `load()` in your app before anything starts.'
    );
  }

  if (options.$doc) {
    path = `$doc.${path}`;
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
    const storeValue: T = options.copy
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
      } as T);
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
          } as T);
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
