/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import produce from 'immer';
import {
  configureStore,
  combineReducers,
  StoreEnhancer,
  ConfigureEnhancersCallback,
  DeepPartial,
  EnhancedStore,
  AnyAction,
} from '@reduxjs/toolkit';
import { EleganteBrowser } from './Browser';

export interface Action<T = any> {
  type: string;
  payload: T;
}

/**
 * Easily create redux reducers powered by immer.js
 *
 * @export
 * @template T
 * @param {T} init
 * @param {*} tree
 * @returns {fn}
 * @example
 *
 * import { createReducer } from '@elegante/browser';
 *
 * const person = createReducer<{
 *   firstName: string;
 *   lastName: string;
 * }>(
 *   // initial state
 *   {
 *     firstName: 'John',
 *     lastName: 'Doe',
 *   },
 *   // actions
 *   {
 *    setFirstName: (state, action) => {
 *         state.firstName = action.payload;
 *     },
 *     setLastName: (state, action) => {
 *         state.lastName = action.payload;
 *     },
 *     resetPerson: (state, action) => {
 *         state.firstName = null;
 *         state.lastName = null;
 *     },
 *   }
 * );
 */
export function createReducer<T = any>(init: T, tree: any) {
  return function (state: T = init, action: AnyAction) {
    if (tree[action.type]) {
      return produce<T>(state, (draft) => {
        if (typeof state === 'object') {
          return void tree[action.type](draft, action);
        }
        return tree[action.type](draft, action);
      });
    }
    return state;
  };
}

/**
 * Easily create redux actions
 *
 * @export
 * @template T
 * @param {string} type
 * @returns {fn}
 *
 * @example
 *
 * import { createAction, dispatch } from '@elegante/browser';
 *
 * // create action
 * const increment = createAction<number>('increment');
 *
 * // dispatch
 * dispatch(increment(54))
 */
export function createAction<T = any>(
  type: string
): (payload?: T) => Action<T> {
  return (payload?: T) => {
    return {
      type,
      payload: payload ?? ({} as T),
    };
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
export function dispatch<T = any>(
  action: Action<T> | ((dispatch: any) => Promise<boolean | void> | void)
): Action<T> {
  if (!EleganteBrowser.store) {
    throw new Error(
      'unable to find any store. to use dispatch make sure to import { load } from @elegante/browser and call `load()` in your app startup.'
    );
  }
  return EleganteBrowser.store.dispatch(action as Action<T>);
}

/**
 * Create custom redux store
 * @example
 * import {
 *   createStore,
 *   createReducer,
 *   applyDevTools,
 *   applyMiddleware
 * } from '@elegante/browser';
 *
 * export const counter = createReducer(0, {
 *   increment: (state, action) => state + action.payload,
 *   decrement: (state, action) => state - action.payload
 * });
 *
 *  // logger middleware example
 *  const logger = store => next => action => {
 *    console.log('dispatching', action);
 *    const result = next(action);
 *    console.log('next state', store.getState());
 *    return result;
 *  };
 *
 *  createStore(
 *    // list of reducers
 *    { counter },
 *    // initial state
 *    { counter: 420 },
 *    // composing enhancers
 *    compose(applyDevTools({ production: false }), applyMiddleware(logger))
 *  );
 *
 *  store().subscribe(it => console.log(it, store().getState()));
 *
 * @export
 * @param {*} reducers
 * @param {*} preloadedState
 * @param {*} [enhancers]
 */
export function createStore<S = any>(params: {
  debug?: boolean;
  reducers: any;
  preloadedState?: DeepPartial<S extends any ? S : S>;
  enhancers?: StoreEnhancer[] | ConfigureEnhancersCallback;
}): EnhancedStore {
  const { reducers, preloadedState, enhancers, debug } = params;
  const d = debug ?? EleganteBrowser.debug;

  const store = configureStore({
    devTools: d
      ? {
          trace: true,
          traceLimit: 100,
        }
      : false,
    reducer: combineReducers(reducers),
    enhancers,
    preloadedState,
  });

  return store;
}

interface QueryPayload {
  key: string;
  value?: any;
}

/**
 * The $doc reducer + actions
 * also used internally to store queried results
 */
export const $docSet = createAction<QueryPayload>('$docSet');
export const $docUnset = createAction<QueryPayload>('$docUnset');
export const $docReset = createAction('$docReset');
export function $doc() {
  return createReducer<{
    [key: string]: any;
  }>(
    // initial state
    {},
    // actions
    {
      $docSet: (state: any, action: Action<QueryPayload>) => {
        state[action.payload.key] = action.payload.value;
      },
      $docUnset: (state: any, action: Action<QueryPayload>) => {
        delete state[action.payload.key];
      },
      $docReset: (state: any) => {
        for (const key in state) {
          delete state[key];
        }
      },
    }
  );
}
