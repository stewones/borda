import { ɵprovideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';

import {
  Action,
  Borda,
  createAction,
  createReducer,
} from '@borda/browser';
import {
  BordaClient,
  isEqual,
  isServer,
  Record,
  Session,
  User,
} from '@borda/client';

import { AppComponent } from './app/app.component';
import { environment } from './environment';

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
export const coolReset = createAction('cool/action/reset');

export const sessionSet = createAction<Session>('session/set');
export const sessionReset = createAction('session/reset');

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
        ['cool/action/set']: (state: CoolState, action: Action<CoolState>) => {
          borda.cache.set('cool', action.payload); // optionally: because it's a custom reducer, we need to manually handle the cache
          return action.payload;
        },
        ['cool/action/reset']: (state: any) => {
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

borda
  .browser()
  .then(async () => {
    /**
     * dispatch session before initializing angular app
     */
    const session = await borda.cache.get<Session>('session');

    if (session) {
      borda.dispatch(sessionSet(session));
      borda.auth.become({
        token: session.token,
        // validateSession: false,
      });
    }

    /**
     * bootstrap angular app
     */
    bootstrapApplication(AppComponent, {
      providers: [ɵprovideZonelessChangeDetection()],
    });
  })
  .catch((err) => {
    console.error(err);
  });

export { borda };

if (!isServer()) {
  if (!environment.production) {
    // @ts-ignore
    borda['pubsub'] = BordaClient.pubsub;
    // @ts-ignore
    window['borda'] = borda;
  }
}
