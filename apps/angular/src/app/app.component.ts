import {
  of,
  Subscription,
} from 'rxjs';

import {
  AsyncPipe,
  JsonPipe,
  NgForOf,
  NgIf,
} from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  signal,
} from '@angular/core';
import {
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
} from '@angular/forms';

import {
  fast,
  Fast,
  from,
} from '@borda/browser';
import {
  Session,
  User,
} from '@borda/client';

import { environment } from '../environment';
import {
  borda,
  coolInitialState,
  coolReset,
  coolSet,
  CoolState,
  Counter,
  sessionInitialState,
  sessionReset,
  sessionSet,
} from '../main';

console.time('startup');

function ping() {
  return fetch(`${environment.serverURL}/ping`, {
    headers: {
      'Content-Type': 'text/html',
      'X-Borda-Api-Key': environment.serverKey,
    },
  });
}

function somePromise() {
  return new Promise<number>((resolve, reject) => {
    const randomNumber = Math.floor(Math.random() * 1000);
    console.log('resolving random number from promise', randomNumber);
    // resolve a random number to test cache invalidation
    return resolve(randomNumber);
  });
}

@Component({
  standalone: true,
  selector: 'borda-app',
  imports: [
    NgIf,
    NgForOf,
    AsyncPipe,
    FormsModule,
    JsonPipe,
    ReactiveFormsModule,
  ],

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
      Increase count (realtime*):
      {{ counterRemote().total }}
    </button>
    <button (click)="reload()" title="click to refresh the page">
      Local Total (refresh): {{ counterLocalTotal() }}
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
    <br />
    *realtime requires a valid session
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

    <ng-container *ngIf="!session()?.token">
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

    <button *ngIf="session()?.token" (click)="signOut()">
      Logout from {{ session().user.name }} ({{ session().user.email }})
    </button>

    <hr />
    Error: {{ (signInError | json) ?? '' }}

    <hr />

    <ng-container *ngIf="session()?.token">
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
          <th *ngIf="session()?.token">actions</th>
        </tr>
        <tr
          *ngFor="let user of publicUsers$ | async; trackBy: trackByUserEmail"
        >
          <td>{{ user.name }}</td>
          <td>{{ user.email }}</td>
          <td align="center">{{ user.createdAt }}</td>
          <td align="center" *ngIf="session()?.token">
            <button (click)="deleteUser(user.objectId)">Delete</button>
          </td>
        </tr>
      </table>

      <h4>&#64;Fast Promise</h4>
      <code>
        <pre>Random number: {{ fromPromise$ | async }}</pre>
      </code>

      <h4>&#64;Fast Query (needs login)</h4>
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
    Session: {{ session() | json }}
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
    Session: {{ session() | json }}
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
  `,
})
export class AppComponent {
  counterRemote = signal<Partial<Counter>>({
    total: 0,
    name: 'borda',
  });

  counterLocalTotal = signal(0);
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

  session = signal<Session>(sessionInitialState);

  cool$ = borda.connect<CoolState>('cool'); // async pipe example
  publicUsers$ = borda.connect<User[]>('publicUsers');

  @Fast('myOwnPromise')
  fromPromise$ = from(somePromise());

  @Fast('oldestUsers')
  oldestUsers$ = borda.getState<string>('session.token')
    ? from(
        borda
          .query<User>('PublicUser')
          .filter({
            expiresAt: {
              $exists: false,
            },
          })
          .pipeline([
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
    borda
      .connect<Session>('session')
      .subscribe((session) => this.session.set(session));
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
    this.counterRemote.set(await borda.cloud.run<Counter>('getCounter'));
    this.counterLocalTotal.set(this.counterRemote().total ?? 0);

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
    this.subscription$['counterUpdate'] = borda
      .query<Counter>('Counter')
      .filter({
        name: {
          $eq: 'borda',
        },
      })
      .on('update')
      .subscribe({
        next: ({ doc }) => {
          console.log('counter update', doc);
          this.counterRemote.set(doc);
          this.cdr.markForCheck();
        },
        error: (err) => console.error(err),
      });

    this.subscription$['userDelete'] = borda
      .query<User>('PublicUser')
      .on('delete')
      .subscribe(({ doc, ...rest }) => {
        console.log('user deleted', doc, rest);
        borda.setState(
          'publicUsers',
          borda
            .getState<User[]>('publicUsers')
            .filter((user) => user.objectId !== doc.objectId)
        );
      });

    this.subscription$['userInsert'] = borda
      .query<User & any>('PublicUser')
      .filter({
        expiresAt: {
          $exists: -1,
        },
      })
      .sort({
        createdAt: -1,
      })
      .on('insert')
      .subscribe(({ doc }) => {
        console.log('user inserted', doc);
        borda.setState('publicUsers', [
          doc,
          ...(borda.getState<User[]>('publicUsers') || []),
        ]);
      });
  }

  unsubscribe() {
    for (const key in this.subscription$) {
      this.subscription$[key].unsubscribe();
    }
  }

  increase() {
    this.counterLocalTotal.set(this.counterLocalTotal() + 1);
    borda.cloud.run('increaseCounter', {
      objectId: this.counterRemote().objectId,
      total: this.counterLocalTotal(),
    });
  }

  reload() {
    window.location.reload();
  }

  async signUp() {
    const { name, email, password } = this.signUpForm.getRawValue();
    try {
      const response = await borda.auth.signUp({
        name: name ?? '',
        email: email ?? '',
        password: password ?? '',
      });

      const { user, token, ...rest } = response;

      this.signInError = undefined;
      this.signUpError = undefined;
      this.cdr.markForCheck();

      borda.dispatch(sessionSet(response));

      this.loadPublicUsers();
      this.subscribe();
    } catch (err) {
      console.error(err);
      this.signUpError = err;
      this.cdr.markForCheck();
    }
  }

  async signIn() {
    const { email, password } = this.signInForm.getRawValue() as {
      email: string;
      password: string;
    };
    try {
      const response = await borda.auth.signIn(
        { email, password },
        {
          projection: {
            name: 1,
            email: 1,
          },
        }
      );

      const { user, token, ...rest } = response;

      this.signInError = undefined;
      this.signUpError = undefined;
      this.cdr.markForCheck();

      borda.dispatch(sessionSet(response));

      /**
       * load a protected function
       * by default all functions requires a valid user session token
       */
      this.loadPublicUsers();
      this.subscribe();
    } catch (err) {
      console.error(err);
      this.signInError = err;
      this.cdr.markForCheck();
    }
  }

  async signOut() {
    const resetState = async () => {
      borda.resetState();
      borda.dispatch(sessionReset());
      borda.dispatch(coolReset());
    };

    borda.auth.signOut().catch((err) => {});
    resetState();
    this.loadPublicUsers();
  }

  async changeEmail() {
    const { email, password } = this.changeEmailForm.getRawValue();
    try {
      const response = await borda.auth.updateEmail({
        newEmail: email as string,
        currentPassword: password as string,
      });

      this.changeEmailError = undefined;
      this.cdr.markForCheck();

      borda.dispatch(sessionSet(response));
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
      const response = await borda.auth.updatePassword({
        currentPassword: currentPassword as string,
        newPassword: newPassword as string,
      });

      this.changePasswordError = undefined;
      this.cdr.markForCheck();

      borda.dispatch(sessionSet(response));
    } catch (err: any) {
      console.error(err);
      this.changePasswordError = err.message ? err.message : err;
      this.cdr.markForCheck();
    }
  }

  async forgotPassword() {
    const { email } = this.forgotPasswordForm.getRawValue();
    try {
      await borda.auth.forgotPassword({ email: email as string });

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
    borda
      .query<User>('PublicUser')
      .filter({
        objectId: {
          $eq: objectId,
        },
      })
      .delete();
  }

  resetPublicUsers() {
    borda.unsetState('publicUsers');
    this.loadPublicUsers();
  }

  loadPublicUsers() {
    borda.cloud
      .run<User[]>('getPublicUsers')
      .then((users) => borda.setState('publicUsers', users));

    if (borda.getState('session.token')) {
      borda.dispatch(
        coolSet({
          hey: 'dude',
          this: 'is',
          logged: '🔐',
        })
      );
    } else {
      borda.dispatch(coolSet(coolInitialState));
    }
  }

  trackByUserEmail(index: number, user: User) {
    return user.email;
  }

  async createRandomUser() {
    // create a random email
    const email = `${Math.random().toString(36).substring(2, 15)}@random.email`;
    const name = `${Math.random().toString(36).substring(2, 15)}`;
    const user = await borda.query<User>('PublicUser').insert({
      name,
      email,
    });
    console.log('createRandomUser()', user);
  }
}
