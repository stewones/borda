import { of, Subscription } from 'rxjs';

import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
} from '@angular/core';
import {
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
} from '@angular/forms';

import {
  Action,
  connect,
  createAction,
  createReducer,
  dispatch,
  fast,
  Fast,
  from,
  getDocState,
  getState,
  load,
  resetDocState,
  setDocState,
  unsetDocState,
} from '@elegante/browser';
import {
  ActiveParams,
  ActiveRecord,
  Auth,
  cleanArray,
  init,
  isEqual,
  LocalStorage,
  log,
  ping,
  query,
  Record,
  runFunction,
  Session,
  User,
} from '@elegante/sdk';

console.time('startup');

init({
  apiKey: '**elegante**',
  serverURL: 'http://localhost:1337/server',
  debug: true,
  validateSession: false,
});

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
});

const coolSet = createAction<any>('coolSet');
const coolReset = createAction('coolReset');
const sessionSet = createAction<Session>('sessionSet');
const sessionUnset = createAction('sessionUnset');

const coolInitialState: any = {
  hey: 'dude',
  this: 'is',
  cool: '🤓',
};

const session = LocalStorage.get('session');

if (session) {
  dispatch(sessionSet(session));
}

interface Counter extends Record {
  total: number;
  name: string;
}

function somePromise() {
  return new Promise<number>((resolve, reject) => {
    const randomNumber = Math.floor(Math.random() * 1000);
    console.debug('resolving random number from promise', randomNumber);
    // resolve a random number to test cache invalidation
    return resolve(randomNumber);
  });
}

interface UserExtended extends User {
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

@Component({
  standalone: true,
  selector: 'elegante-app',
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      form {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      input {
        padding: 0.25rem;
      }

      button {
        padding: 0.45rem;
      }

      table {
        width: 100%;
      }
    `,
  ],
  template: `
    <button
      (click)="increase()"
      title="click to increase the counter. which should reflect here in realtime if subscribed. experiment open many tabs at same time and see the changes reflect."
    >
      Increase count (realtime):
      {{ counter.total }}
    </button>
    <button (click)="reload()" title="click to refresh the page">
      Next Total (local): {{ counterTotalNext }}
    </button>
    <button
      (click)="unsubscribe()"
      title="click to unsubscribe all subscriptions"
    >
      Unsubscribe Realtime
    </button>
    <button
      (click)="subscribe()"
      title="click to re-subscribe all subscriptions"
    >
      Re-subscribe Realtime
    </button>

    <br />

    <h2>Sign Up</h2>
    <form [formGroup]="signUpForm" (ngSubmit)="signUp()">
      <label for="name">name: </label>
      <input id="name" type="text" formControlName="name" />
      <label for="email">email: </label>
      <input id="email" type="text" formControlName="email" />
      <label for="password">password: </label>
      <input id="password" type="text" formControlName="password" />
      <button type="submit" [disabled]="signUpForm.invalid">
        Create Account
      </button>
    </form>

    <hr />
    Error: {{ (signUpError | json) ?? '' }}
    <hr />
    <br />

    <ng-container *ngIf="session$ | async as session">
      <ng-container *ngIf="!session?.token">
        <h2>Sign In</h2>
        <form [formGroup]="signInForm" (ngSubmit)="signIn()">
          <label for="email">email </label>
          <input id="email" type="text" formControlName="email" />
          <label for="password">password: </label>
          <input id="password" type="text" formControlName="password" />
          <button type="submit" [disabled]="signInForm.invalid">
            Login Account
          </button>
        </form>
      </ng-container>

      <button *ngIf="session?.token" (click)="signOut()">
        Logout from {{ session.user.name }} ({{ session.user.email }})
      </button>
    </ng-container>

    <hr />
    Error: {{ (signInError | json) ?? '' }}

    <hr />
    <ng-container *ngIf="session$ | async as session">
      Session: {{ session | json }}
      <hr />
    </ng-container>

    <ng-container>
      <br />
      <h2>
        Public Users
        <button (click)="resetPublicUsers()">Force Reload</button>
        <button (click)="createRandomUser()">Add Random</button>
      </h2>
      <br />
      <table cellPadding="5" cellSpacing="10">
        <tr>
          <th align="left">name</th>
          <th align="left">email</th>
          <th>createdAt</th>
          <th *ngIf="(session$ | async)?.token">actions</th>
        </tr>
        <tr
          *ngFor="let user of publicUsers$ | async; trackBy: trackByUserEmail"
        >
          <td>{{ user.name }}</td>
          <td>{{ user.email }}</td>
          <td align="center">{{ user.createdAt }}</td>
          <td align="center" *ngIf="(session$ | async)?.token">
            <button (click)="deleteUser(user.objectId)">Delete</button>
          </td>
        </tr>
      </table>

      <h4>@Fast Promise</h4>
      <code>
        <pre>Random number: {{ fromPromise$ | async }}</pre>
      </code>

      <h4>@Fast Query (needs login)</h4>
      <code>
        <pre>Oldest users: {{ oldestUsers$ | async | json }}</pre>
      </code>

      <h4>Cool reducer</h4>
      <code>
        <pre>{{ cool$ | async | json }}</pre>
      </code>
    </ng-container>

    <br />

    <h2>Change Current User Email</h2>
    <form [formGroup]="changeEmailForm" (ngSubmit)="changeEmail()">
      <label for="email">new email: </label>
      <input id="email" type="text" formControlName="email" />
      <label for="password">current password: </label>
      <input id="password" type="text" formControlName="password" />
      <button type="submit" [disabled]="changeEmailForm.invalid">
        Change Email
      </button>
    </form>

    <hr />
    Error: {{ (changeEmailError | json) ?? '' }}
    <hr />
    Session: {{ session$ | async | json }}
    <br />
    <br />
    <h2>Change Current User Password</h2>
    <form [formGroup]="changePasswordForm" (ngSubmit)="changePassword()">
      <label for="currentPassword">current password: </label>
      <input
        id="currentPassword"
        type="text"
        formControlName="currentPassword"
      />

      <label for="newPassword">new password: </label>
      <input id="newPassword" type="text" formControlName="newPassword" />

      <button type="submit" [disabled]="changePasswordForm.invalid">
        Change Password
      </button>
    </form>

    <hr />
    Error: {{ (changePasswordError | json) ?? '' }}
    <hr />
    Session: {{ session$ | async | json }}
    <br />

    <br />
    <h2>User Forgot Password</h2>
    <form [formGroup]="forgotPasswordForm" (ngSubmit)="forgotPassword()">
      <label for="email">email: </label>
      <input id="email" type="text" formControlName="email" />

      <button type="submit" [disabled]="forgotPasswordForm.invalid">
        Send Password Reset Email
      </button>
    </form>

    <hr />
    Error: {{ (forgotPasswordError | json) ?? '' }}
    <br />
    <!-- 
    <button (click)="loadLotsOfDataIntoLocalStorage()">
      Load Lots of Data into Local Storage
    </button> -->
  `,
})
export class AppComponent {
  counter: Counter = {
    total: 0,
    name: 'elegante',
  } as Counter;

  counterTotalNext = 0;
  subscription$: { [key: string]: Subscription } = {};

  signUpForm = new FormGroup({
    name: new FormControl(''),
    email: new FormControl(''),
    password: new FormControl(''),
  });

  signInForm = new FormGroup({
    email: new FormControl(''),
    password: new FormControl(''),
  });

  changeEmailForm = new FormGroup({
    email: new FormControl(''),
    password: new FormControl(''),
  });

  changePasswordForm = new FormGroup({
    currentPassword: new FormControl(''),
    newPassword: new FormControl(''),
  });

  forgotPasswordForm = new FormGroup({
    email: new FormControl(''),
  });

  signInError: any;
  signUpError: any;
  changeEmailError: any;
  changePasswordError: any;
  forgotPasswordError: any;

  session$ = connect.bind(this)<Session>('session');
  cool$ = connect.bind(this)<any>('cool');
  publicUsers$ = connect.bind(this)<User[]>('publicUsers', { $doc: true });

  @Fast('myOwnPromise')
  fromPromise$ = from(somePromise());

  @Fast('oldestUsers')
  oldestUsers$ = getState('session.token')
    ? from(
        query<User>('PublicUser')
          .filter({
            expiresAt: {
              $exists: false,
            },
          })
          .pipeline([
            {
              $match: {
                updatedAt: {
                  $exists: true,
                },
              },
            },
            {
              $sort: { createdAt: 1 },
            },
          ])
          .limit(10)
          .aggregate({ allowDiskUse: true, inspect: false })
      )
    : of([]);

  constructor(private cdr: ChangeDetectorRef) {
    ping().then(() => console.timeEnd('startup'));
  }

  ngOnDestroy() {}

  async ngOnInit() {
    /**
     * example of programmatic fast promise (rather than @decorator)
     */
    fast('myOwnPromise-programmatic', from(somePromise())).subscribe((r) =>
      console.log('programmatic fast promise', r)
    );
    /**
     * check if default record of counter exists
     * if not we create it, all in server side
     */
    this.counter = await runFunction<Counter>('getCounter');
    this.counterTotalNext = this.counter.total;

    /**
     * subscribe to realtime updates
     */
    this.subscribe();

    /**
     * load a public list of users
     */
    this.loadPublicUsers();
  }

  async subscribe() {
    /**
     * force unsubscribe all subscriptions
     */
    this.unsubscribe();

    /**
     * subscribe to realtime updates
     */
    this.subscription$['counterUpdate'] = query<Counter>('Counter')
      .filter({
        name: {
          $eq: 'elegante',
        },
      })
      .on('update')
      .subscribe({
        next: ({ doc }) => {
          console.log('counter update', doc);
          this.counter = doc;
          this.cdr.markForCheck();
        },
        error: (err) => console.error(err),
      });

    this.subscription$['userDelete'] = query<User>('PublicUser')
      .on('delete')
      .subscribe(({ doc, ...rest }) => {
        console.log('user deleted', doc, rest);
        setDocState(
          'publicUsers',
          getDocState<User[]>('publicUsers').filter(
            (user) => user.objectId !== doc.objectId
          )
        );
      });

    this.subscription$['userInsert'] = query<User>('PublicUser')
      .sort({
        createdAt: -1,
      })
      .on('insert')
      .subscribe(({ doc }) => {
        console.log('user inserted', doc);
        setDocState('publicUsers', [
          doc,
          ...(getDocState<User[]>('publicUsers') || []),
        ]);
      });
  }

  unsubscribe() {
    for (const key in this.subscription$) {
      this.subscription$[key].unsubscribe();
    }
  }

  increase() {
    this.counterTotalNext = this.counterTotalNext + 1;
    this.cdr.markForCheck();
    runFunction('increaseCounter', {
      objectId: this.counter.objectId,
      total: this.counterTotalNext,
    });
  }

  reload() {
    window.location.reload();
  }

  async signUp() {
    const { name, email, password } = this.signUpForm.getRawValue();
    try {
      const response = await Auth.signUp({
        name: name ?? '',
        email: email ?? '',
        password: password ?? '',
      });

      const { user, token, ...rest } = response;

      this.signInError = undefined;
      this.signUpError = undefined;
      this.cdr.markForCheck();

      dispatch(sessionSet(response));

      this.loadPublicUsers();
    } catch (err) {
      console.error(err);
      this.signUpError = err;
      this.cdr.markForCheck();
    }
  }

  async signIn() {
    const { email, password } = this.signInForm.getRawValue();
    try {
      const response = await Auth.signIn(email as string, password as string, {
        projection: {
          name: 1,
          email: 1,
        },
      });

      const { user, token, ...rest } = response;

      this.signInError = undefined;
      this.signUpError = undefined;
      this.cdr.markForCheck();

      dispatch(sessionSet(response));

      /**
       * load a protected function
       * by default all functions requires a valid user session token
       */
      this.loadPublicUsers();
    } catch (err) {
      console.error(err);
      this.signInError = err;
      this.cdr.markForCheck();
    }
  }

  async signOut() {
    const resetState = () => {
      resetDocState(); // reset $doc state
      dispatch(sessionUnset());
      dispatch(coolReset());
    };

    Auth.signOut().catch((err) => {});
    resetState();
  }

  async changeEmail() {
    const { email, password } = this.changeEmailForm.getRawValue();
    try {
      const response = await Auth.updateEmail(
        email as string,
        password as string
      );

      this.changeEmailError = undefined;
      this.cdr.markForCheck();

      dispatch(sessionSet(response));
    } catch (err: any) {
      console.error(err);
      this.changeEmailError = err.message ? err.message : err;
      this.cdr.markForCheck();
    }
  }

  async changePassword() {
    const { currentPassword, newPassword } =
      this.changePasswordForm.getRawValue();
    try {
      const response = await Auth.updatePassword(
        currentPassword as string,
        newPassword as string
      );

      this.changePasswordError = undefined;
      this.cdr.markForCheck();

      dispatch(sessionSet(response));
    } catch (err: any) {
      console.error(err);
      this.changePasswordError = err.message ? err.message : err;
      this.cdr.markForCheck();
    }
  }

  async forgotPassword() {
    const { email } = this.forgotPasswordForm.getRawValue();
    try {
      await Auth.forgotPassword(email as string);

      this.forgotPasswordError = undefined;
      this.cdr.markForCheck();

      alert('check your server logs for the reset password code');
    } catch (err: any) {
      console.error(err);
      this.forgotPasswordError = err.message ? err.message : err;
      this.cdr.markForCheck();
    }
  }

  deleteUser(objectId: string) {
    query<User>('PublicUser')
      .filter({
        objectId: {
          $eq: objectId,
        },
      })
      .delete();
  }

  resetPublicUsers() {
    unsetDocState('publicUsers');
    this.loadPublicUsers();
  }

  loadPublicUsers() {
    runFunction<User[]>('getPublicUsers').then((users) =>
      setDocState('publicUsers', users)
    );

    if (getState('session.token')) {
      dispatch(
        coolSet({
          hey: 'dude',
          this: 'is',
          logged: '🔐',
        })
      );
    } else {
      dispatch(coolSet(coolInitialState));
    }
  }

  trackByUserEmail(index: number, user: User) {
    return user.email;
  }

  async createRandomUser() {
    // create a random email
    const email = `${Math.random().toString(36).substring(2, 15)}@random.email`;
    const name = `${Math.random().toString(36).substring(2, 15)}`;
    const user = new PublicUserModel({ email, name });
    await user.save();
    console.log('createRandomUser()', user.getRawValue());
  }

  async loadLotsOfDataIntoLocalStorage() {
    const data = [];
    for (let i = 0; i < 9999; i++) {
      data.push({
        id: i,
        name: `name ${i}`,
        email: `email ${i}`,
      });
    }
    LocalStorage.set('lotsOfData', [
      ...(LocalStorage.get('lotsOfData') || []),
      ...data,
    ]);
    console.log(`loaded ${data.length} items into localStorage`);
    console.log(await LocalStorage.estimate());
  }
}
