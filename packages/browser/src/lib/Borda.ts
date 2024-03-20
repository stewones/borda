/* eslint-disable @typescript-eslint/no-explicit-any */
import watch from 'redux-watch';
import { Observable } from 'rxjs';

import {
  BordaClient,
  BordaParams,
  cloneDeep,
  Document,
  get,
  IndexedDB,
  isServer,
} from '@borda/client';

import {
  Action,
  Store,
} from '@reduxjs/toolkit';

import type { FastOptions } from './fast';
import {
  borda,
  bordaReset,
  bordaSet,
  bordaUnset,
  createStore,
} from './redux';

export type BordaStateFastParams = Pick<
  FastOptions,
  'mode' | 'differ' | 'mutable'
>;

export interface SetStateOptions {
  /**
   * whether or not to useCache the state in local storage
   * default: true
   */
  useCache?: boolean;
}

export interface UnsetStateParams {
  /**
   * whether or not to also clean local storage
   * default: true
   */
  clearCache?: boolean;
}
export interface ResetStateParams {
  /**
   * whether or not to also clean local storage
   * default: true
   */
  clearCache?: boolean;
}

export interface ListenerOptions {
  context: boolean;
  copy: boolean;
}

export interface StateContext<T = Document> {
  path: string;
  prev: T;
  next: T;
}

export type StateDocument =
  | Document
  | Document[]
  | string
  | number
  | null
  | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | any;

export interface BordaStateParams extends BordaParams {
  inspect?: boolean;
  traceLimit?: number;
  reducers?: any;
  preloadedState?: any;
  cacheStore?: string;
  cacheVersion?: number;
  fast?: BordaStateFastParams;
}

export class Borda extends BordaClient {
  #inspect!: boolean;
  #traceLimit!: number;
  #reducers!: any;
  #preloadedState!: any;
  #cacheStore!: string;
  #cacheVersion!: number;
  #fast!: BordaStateFastParams;

  static App: Record<
    string,
    {
      inspect: boolean;
      store: Store;
      cache: IndexedDB;
      fast: BordaStateFastParams;
      getState: <T = Document>(
        path?: string,
        options?: { useCache: boolean }
      ) => T | Promise<T>;
      setState: <T = Document>(
        key: string,
        value: T,
        options?: SetStateOptions & { useCache: boolean }
      ) => void | Promise<void>;
    }
  >;

  get cache() {
    return Borda.App[this.name].cache;
  }

  constructor(params?: Partial<BordaStateParams>) {
    super(params);

    const {
      inspect,
      reducers,
      cacheStore,
      cacheVersion,
      fast,
      traceLimit,
      preloadedState,
    } = params || {};

    this.#inspect = inspect ?? false;
    this.#reducers = reducers;
    this.#cacheStore = cacheStore ?? 'app';
    this.#cacheVersion = cacheVersion ?? 1;
    this.#fast = fast ?? { mode: 'straight' };
    this.#traceLimit = traceLimit ?? 100;
    this.#preloadedState = preloadedState ?? {};

    if (!params?.serverSecret) {
      super.serverSecret = '';
    }
  }

  /**
   * mandatory method to initialize borda in the browser
   * which requires a cache and a store.
   * Note that this is a promise that must be awaited.
   */
  async browser() {
    const cache = new IndexedDB({
      name: this.name,
      store: this.#cacheStore,
      version: this.#cacheVersion,
    });

    Borda.App = {
      ...Borda.App,
      [this.name]: {
        inspect: this.#inspect,
        store: !isServer()
          ? createStore({
              name: this.name,
              reducers: { ...this.#reducers, borda: borda() },
              preloadedState: this.#preloadedState,
              inspect: this.#inspect,
              traceLimit: this.#traceLimit,
            })
          : ({} as Store),
        cache: !isServer() ? await cache.load() : ({} as IndexedDB),
        fast: this.#fast,
        getState: this.getState.bind(this),
        setState: this.setState.bind(this),
      },
    };
  }

  /**
   * Action dispatcher
   *
   * @export
   * @template T
   * @param {(Action<T> | ((dispatch: any) => Promise<boolean | void> | void))} action
   * @returns {*}  {Action<T>}
   */
  dispatch(
    action: Action | ((dispatch: any) => Promise<boolean | void> | void)
  ): Action {
    return Borda.App[this.name].store.dispatch(action as Action);
  }

  /**
   * Provides reactive data access to both borda and custom reducers.
   * The path is a string with dot notation in case of custom reducers.
   * To use a borda state, make sure you don't have any custom reducer with the same name.
   *
   * The context option provides the previous and next value of the state.
   * This is useful if you want to know what changed in the state.
   *
   * The copy option makes a copy of the state. Default to false.
   *
   * The borda option allows to access the internal borda state.
   *
   * @export
   * @template T
   * @param {string} path
   * @param {Partial<ListenerOptions>} [options={
   *     context: false,
   *     copy: false,
   *     borda: false,
   *   }]
   * @returns {*}  {Observable<T>}
   */
  connect<T = Document>(
    path: string,
    options: Partial<
      ListenerOptions & { onChanges: (nextValue: any) => void; borda: boolean }
    > = {
      context: false,
      copy: false,
      borda: false,
      onChanges: () => {
        //
      },
    }
  ): Observable<T> {
    if (typeof window === 'undefined') {
      return new Observable<T>();
    }

    // can't really rely on auto-detection here so we need to specify it
    if (options.borda) {
      path = `borda.${path}`;
    }

    const source = new Observable<T>((observer) => {
      const storeInstance = Borda.App[this.name].store;
      const storeValue: T = options.copy
        ? cloneDeep(get(storeInstance.getState(), path))
        : get(storeInstance.getState(), path);

      // creates a watcher
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
            options.onChanges
              ? options.onChanges({
                  path,
                  prev,
                  next: nextValue,
                } as T)
              : null;
          } else {
            observer.next(nextValue);
            options.onChanges ? options.onChanges(nextValue) : null;
          }
        })
      );
    });

    return source;
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
  // Overload signatures
  getState<T = StateDocument>(
    path?: string,
    options?: { useCache: boolean }
  ): T;
  getState<T = StateDocument>(
    path: string,
    options: { useCache: boolean }
  ): Promise<T>;
  // Implementation signature
  getState<T = StateDocument>(
    path?: string,
    { useCache }: { useCache?: boolean } = { useCache: false }
  ) {
    if (typeof window === 'undefined') {
      return {} as T;
    }

    const currentState = Borda.App[this.name].store.getState();

    if (!path) {
      return currentState as T;
    }

    const customState = get(currentState, path);

    if (customState) {
      return customState as T;
    }

    const bordaState = get(currentState, 'borda')[path] as T;

    if (bordaState || !useCache) {
      return bordaState as T;
    }

    // try to get from cache
    return Borda.App[this.name].cache.get(path).then((bordaCache) => {
      if (this.#inspect) {
        console.debug('get cache', path, bordaCache);
      }

      return bordaCache as T;
    });
  }

  // overload signatures
  setState<T = StateDocument>(
    key: string,
    value: T,
    options: SetStateOptions & { useCache: boolean }
  ): Promise<void>;
  setState<T = StateDocument>(
    key: string,
    value: T,
    options?: SetStateOptions & { useCache: boolean }
  ): void;
  // implementation signature
  async setState<T = StateDocument>(
    key: string,
    value: T,
    options: SetStateOptions = { useCache: false }
  ) {
    this.dispatch(
      bordaSet({
        key,
        value,
      })
    );
    if (options.useCache) {
      if (this.#inspect) {
        console.debug('set cache', key, value);
      }
      await Borda.App[this.name].cache.set(key, value);
    }
  }

  // overload signatures
  unsetState(
    key: string,
    options: UnsetStateParams & { clearCache: boolean }
  ): Promise<void>;
  unsetState(
    key: string,
    options?: UnsetStateParams & { clearCache: boolean }
  ): void;
  // implementation signature
  async unsetState(
    key: string,
    options: UnsetStateParams = { clearCache: false }
  ) {
    this.dispatch(
      bordaUnset({
        key,
      })
    );

    if (options.clearCache) {
      await Borda.App[this.name].cache.unset(key);
    }
  }

  /**
   * Reset borda state and optionally clear the cache.
   * To reset custom reducers, you must implement your own reset action and `dispatch(myResetAction())`
   */
  // overload signatures
  resetState(options: ResetStateParams): Promise<void>;
  resetState(options?: ResetStateParams): void;
  // implementation signature
  async resetState(options: ResetStateParams = { clearCache: false }) {
    this.dispatch(bordaReset());
    if (options.clearCache) {
      await Borda.App[this.name].cache.clear();
    }
  }
}

export const BordaBrowser = Borda;
