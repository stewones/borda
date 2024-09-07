import { Action, Borda, createAction, createReducer } from '@borda/browser';
import { Instant, isEqual, Record, Session, User } from '@borda/client';

import { schema } from '@/common';

import { environment } from '../environment';

export interface Counter extends Record {
  total: number;
  name: string;
}

export interface UserExtended extends User {
  username?: string;
}

export interface CoolState {
  hey: string;
  this: string;
  cool: string;
  logged?: string;
}

/**
 * define initial state
 */
export const sessionInitialState = {
  user: {} as User,
  token: '',
} as Session;

export const coolInitialState = {
  hey: 'dude',
  this: 'is',
  cool: '🤓',
} as CoolState;

/**
 * define actions
 */
export const coolSet = createAction<any>('cool/action/set');
export const coolSetHey = createAction<string>('cool/action/set/hey');
export const coolReset = createAction('cool/action/reset');

export const sessionSet = createAction<Session>('session/set');
export const sessionReset = createAction('session/reset');

/**
 * Instant
 */

/**
 * export borda instance with browser capabilities
 */
const borda = new Borda({
  inspect: !environment.production,
  serverURL: environment.serverURL,
  serverKey: environment.serverKey,
  reducers: {
    session: createReducer<Session>(
      // preload state
      sessionInitialState,
      // handle actions
      {
        ['session/set']: (state: Session, action: Action<Session>) => {
          state.user = action.payload.user;
          state.token = action.payload.token;
          borda.cache.set('session', state); // optionally: because it's a custom reducer, we need to manually handle the cache
        },
        ['session/reset']: (state: any) => {
          borda.cache.unset('session'); // optionally: because it's a custom reducer, we need to manually handle the cache
          return sessionInitialState;
        },
      }
    ),
    cool: createReducer<CoolState>(
      // preload state
      coolInitialState,
      // handle actions
      {
        [coolSet.type]: (state: CoolState, action: Action<CoolState>) => {
          borda.cache.set('cool', action.payload); // optionally: because it's a custom reducer, we need to manually handle the cache
          return action.payload;
        },
        [coolSetHey.type]: (state: CoolState, action: Action<string>) => {
          state.hey = action.payload;
          return state;
        },
        [coolReset.type]: (state: any) => {
          borda.cache.unset('cool'); // optionally: because it's a custom reducer, we need to manually handle the cache
          return sessionInitialState;
        },
      }
    ),
  },
  fast: {
    /**
     * implement a custom differ function to compare state changes
     * this controls wheter the stream should emit a new value or not for fast calls
     */
    differ: (prev, next) => {
      if (borda.inspect) {
        console.log('custom Fast differ', 'prev', prev, 'next', next);
      }
      return !isEqual(prev, next); // replace with your own diffing function
    },
  },
});

const insta = new Instant({
  schema,
  name: 'InstantTest',
  inspect: true,
  index: {
    users: ['_updated_at', '_expires_at', 'name', 'email'],
  },
  size: environment.instantSize,
  buffer: environment.instantBuffer,
  serverURL: environment.serverURL,
});

export { borda, insta };
