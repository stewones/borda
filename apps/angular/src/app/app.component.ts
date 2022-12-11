import {
  Action,
  createAction,
  createReducer,
  dispatch,
  fast,
  Fast,
  from,
  getDocState,
  getState,
  listener,
  load,
  setDocState,
  unsetDocState,
} from '@elegante/browser';
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
  init,
  query,
  Auth,
  Session,
  runFunction,
  User,
  ping,
  LocalStorage,
  Record,
} from '@elegante/sdk';

import { of, Subscription } from 'rxjs';

console.time('startup');

init({
  apiKey: '**elegante**',
  serverURL: 'http://localhost:1337/server',
  debug: true,
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
  },
});

const sessionSet = createAction<Session>('sessionSet');
const sessionUnset = createAction('sessionUnset');

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
      <ng-container *ngIf="session?.token">
        <br />
        <h2>
          Public Users
          <button (click)="resetPublicUsers()">Reload</button>
        </h2>
        <br />
        <table cellPadding="5" cellSpacing="10">
          <tr>
            <th align="left">name</th>
            <th align="left">email</th>
            <th>createdAt</th>
            <th>actions</th>
          </tr>
          <tr
            *ngFor="let user of publicUsers$ | async; trackBy: trackByUserEmail"
          >
            <td>{{ user.name }}</td>
            <td>{{ user.email }}</td>
            <td align="center">{{ user.createdAt }}</td>
            <td align="center">
              <button (click)="deleteUser(user.objectId)">Delete</button>
            </td>
          </tr>
        </table>

        <h4>@Fast Promise</h4>
        <code>
          <pre>Random number: {{ fromPromise$ | async }}</pre>
        </code>

        <h4>@Fast Query</h4>
        <code>
          <pre>Latest users: {{ latestUsers$ | async | json }}</pre>
        </code>
      </ng-container>
    </ng-container>
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

  signInError: any;
  signUpError: any;

  session$ = listener.bind(this)<Session>('session');
  publicUsers$ = listener.bind(this)<User[]>('publicUsers', { $docs: true });

  @Fast('myOwnPromise')
  fromPromise$ = from(somePromise());

  @Fast('latestUsers')
  latestUsers$ = getState('session.token')
    ? from(
        query<User>('PublicUser')
          // uncoment to test empty results
          // .filter({
          //   name: {
          //     $eq: 'elegante',
          //   },
          // })
          .pipeline([
            {
              $sort: { createdAt: -1 },
            },
          ])
          .limit(10)
          .aggregate({ allowDiskUse: true })
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
     * load a protected function
     * by default all functions requires a valid user session token
     */
    if (getState('session')) {
      this.loadPublicUsers();
    }
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
          ...getDocState<User[]>('publicUsers'),
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
      const response = await Auth.signUp(
        name as string,
        email as string,
        password as string
      );

      const { user, token, ...rest } = response;

      this.signUpError = null;
      this.cdr.markForCheck();

      dispatch(sessionSet(response));
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
    try {
      dispatch(sessionUnset());
      await Auth.signOut();
    } catch (err) {
      console.error(err);
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
  }

  trackByUserEmail(index: number, user: User) {
    return user.email;
  }
}
