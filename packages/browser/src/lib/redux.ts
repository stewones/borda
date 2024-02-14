/**
 * @license
 * Copyright Borda All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://borda.dev/license
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  configureStore,
  createAction as createReduxAction,
  createReducer as createReduxReducer,
  Draft as ImmerDraft,
  EnhancedStore,
} from '@reduxjs/toolkit';

import type { StateDocument } from './Borda';

export interface Action<T = any> {
  type: string;
  payload: T;
}

export type Draft<S> = ImmerDraft<S>;

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
 * import { createReducer } from '@borda/browser';
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
export function createReducer<T = any>(init: T, actions: any) {
  return createReduxReducer<T>(init, (builder) => {
    for (const action in actions) {
      builder.addCase(action, actions[action]);
    }
  });
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
 * import { createAction, dispatch } from '@borda/browser';
 *
 * // create action
 * const increment = createAction<number>('increment');
 *
 * // dispatch
 * dispatch(increment(54))
 */
export const createAction = createReduxAction; // just an alias for convenience, since redux toolkit already has this helper

/**
 * Create custom redux store
 * @example
 * import {
 *   createStore,
 *   createReducer,
 *   applyDevTools,
 *   applyMiddleware
 * } from '@borda/browser';
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
export function createStore({
  reducers,
  preloadedState,
  inspect,
  traceLimit = 100,
}: {
  reducers: any;
  preloadedState: any;
  inspect?: boolean;
  traceLimit?: number;
}): EnhancedStore {
  const store = configureStore({
    devTools: inspect
      ? {
          trace: true,
          traceLimit,
        }
      : false,
    reducer: reducers,
    preloadedState,
  });

  return store;
}

interface QueryPayload {
  key: string;
  value?: StateDocument;
}

type DocState = Record<string, StateDocument>;

/**
 * doc reducer + actions
 */
export const bordaSet = createAction<QueryPayload>('borda/set');
export const bordaUnset =
  createAction<Pick<QueryPayload, 'key'>>('borda/unset');
export const bordaReset = createAction('borda/reset');

export function borda() {
  return createReducer<DocState>(
    {},
    {
      [bordaSet.type]: (state: DocState, action: Action) => {
        state[action.payload.key] = action.payload.value;
      },
      [bordaUnset.type]: (state: DocState, action: Action) => {
        delete state[action.payload.key];
      },
      [bordaReset.type]: (state: DocState) => {
        for (const key in state) {
          delete state[key];
        }
      },
    }
  );
}

