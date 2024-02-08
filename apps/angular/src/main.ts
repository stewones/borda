import { bootstrapApplication } from '@angular/platform-browser';

import {
  Action,
  createAction,
  createReducer,
  dispatch,
  load,
} from '@elegante/browser';

import {
  Borda,
  isEqual,
  LocalStorage,
  Record,
  Session,
  User,
} from '@borda/client';

import { AppComponent } from './app/app.component';
import { environment } from './environment';

/**
 * export borda instance
 */
export const borda = new Borda({
  serverURL: environment.serverURL,
  serverKey: environment.serverKey,
  // state: {} // @todo: configure state (optional)
});

/**
 * shared stuff
 */
export const coolInitialState: any = {
  hey: 'dude',
  this: 'is',
  cool: '🤓',
};

export const coolSet = createAction<any>('coolSet');
export const coolReset = createAction('coolReset');
export const sessionSet = createAction<Session>('sessionSet');
export const sessionUnset = createAction('sessionUnset');

export interface Counter extends Record {
  total: number;
  name: string;
}

export interface UserExtended extends User {
  username?: string;
}

/**
 * load borda state
 * and then bootstrap angular
 */
load({
  debug: true,
  reducers: {
    session: createReducer<Partial<Session>>(
      // initial state
      {
        user: {} as User,
        token: '',
      },
      // actions
      {
        sessionSet: (state: Session, action: Action<Session>) => {
          state.user = action.payload.user;
          state.token = action.payload.token;
          LocalStorage.set('session', state);
        },
        sessionUnset: (state: any) => {
          state.user = {} as User;
          state.token = '';
          LocalStorage.unset('session');
        },
      }
    ),
    cool: createReducer<any>(
      // initial state
      {},
      // actions
      {
        coolSet: (state: any, action: Action<any>) => {
          for (const key in action.payload) {
            state[key] = action.payload[key];
          }
          LocalStorage.set('cool', state);
        },
        coolReset: (state: any) => {
          for (const key in state) {
            delete state[key];
          }
          for (const key in coolInitialState) {
            state[key] = coolInitialState[key];
          }
          LocalStorage.set('cool', state);
        },
      }
    ),
  },
  fast: {
    differ: (prev, next) => {
      /**
       * implement a custom differ function to compare state changes
       * this controls wheter the stream should emit a new value or not
       */
      console.log('global `fast` differ', prev, next);
      return !isEqual(prev, next);
    },
  },
}).then(() => {
  /**
   * dispatch session before bootstrap
   */
  const session = LocalStorage.get('session');

  if (session) {
    dispatch(sessionSet(session));
    borda.auth.become(session.token);
  }

  /**
   * init angular app
   */
  bootstrapApplication(AppComponent).catch((err) => console.error(err));
});
