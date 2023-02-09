import { bootstrapApplication } from '@angular/platform-browser';

import {
  Action,
  createAction,
  createReducer,
  dispatch,
  load,
} from '@elegante/browser';
import {
  ActiveParams,
  ActiveRecord,
  cleanArray,
  init,
  isEqual,
  LocalStorage,
  log,
  Record,
  Session,
  User,
} from '@elegante/sdk';

import { AppComponent } from './app/app.component';

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

export class PublicUserModel extends ActiveRecord<UserExtended> {
  constructor(
    record?: Partial<UserExtended>,
    options: ActiveParams<UserExtended> = {}
  ) {
    /**
     * custom identifier query
     */
    if (!record?.objectId) {
      options.filter = {
        ...options.filter,
        $or: cleanArray([
          record?.email ? { email: record?.email } : {},
          record?.username ? { username: record?.username } : {},
        ]),
      };
    }

    super('PublicUser', record, {
      include: ['photo'],
      ...options,
    });
  }
}

/**
 * init elegante
 */
init({
  apiKey: '**elegante**',
  serverURL: 'http://localhost:1337/server',
  debug: true,
  validateSession: false,
});

/**
 * load elegante browser
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
      log('global `fast` differ', prev, next);
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
  }

  /**
   * init angular app
   */
  bootstrapApplication(AppComponent).catch((err) => console.error(err));
});
