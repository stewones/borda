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
  createClient,
  query,
  Auth,
  Session,
  runFunction,
  User,
  ping,
  LocalStorage,
  Record,
} from '@elegante/sdk';
import { from, map, Subject, Subscription, tap } from 'rxjs';

console.time('startup');

createClient({
  apiKey: '**elegante**',
  serverURL: 'http://localhost:1337/server',
  debug: false,
}).catch((err) => console.error(err));

interface Counter extends Record {
  total: number;
  name: string;
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

    <button *ngIf="session" (click)="signOut()">
      Logout from {{ session.user.name }} ({{ session.user.email }})
    </button>

    <hr />

    Error: {{ (signInError | json) ?? '' }}
    <hr />
    Session: {{ (session | json) ?? '' }}
    <hr />

    <ng-container *ngIf="session?.token">
      <br />
      <h2>Users</h2>
      <br />
      <table cellPadding="5" cellSpacing="10">
        <tr>
          <th align="left">name</th>
          <th align="left">email</th>
          <th>createdAt</th>
          <th>actions</th>
        </tr>
        <tr *ngFor="let user of users">
          <td>{{ user.name }}</td>
          <td>{{ user.email }}</td>
          <td align="center">{{ user.createdAt }}</td>
          <td align="center">
            <button (click)="deleteUser(user.objectId)">Delete</button>
          </td>
        </tr>
      </table>
    </ng-container>
  `,
})
export class AppComponent {
  unsubscribe$ = new Subject<void>();
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

  session: Session | undefined = LocalStorage.get('session');

  users: User[] = [];

  counter: Counter = {
    total: 0,
    name: 'elegante',
  } as Counter;
  counterTotalNext = 0;

  constructor(private cdr: ChangeDetectorRef) {
    ping().then(() => console.timeEnd('startup'));
  }

  ngOnDestroy() {}

  async ngOnInit() {
    /**
     * check if default record of counter exists
     * if not we create it, all on server side
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
    if (this.session) {
      this.loadLatestUsers();
    }

    this.cdr.markForCheck();
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
      .subscribe(
        ({ doc }) => {
          console.log('counter update', doc);
          this.counter = doc;
          this.cdr.markForCheck();
        },
        (err) => console.error(err)
      );

    this.subscription$['userDelete'] = query<User>('PublicUser')
      .on('delete')
      .subscribe(({ doc, ...rest }) => {
        console.log('user deleted', doc, rest);
        this.users = this.users.filter(
          (user) => user.objectId !== doc.objectId
        );
        this.cdr.markForCheck();
      });

    this.subscription$['userInsert'] = query<User>('PublicUser')
      .sort({
        createdAt: -1,
      })
      .on('insert')
      .subscribe(({ doc }) => {
        console.log('user inserted', doc);
        this.users.unshift(doc);
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

      // stores the session object the way you need
      // to just grab the active session
      //
      // import { Auth } from '@elegante/sdk';
      // Auth.current().then(({user, token, ...rest}) => {
      //   console.log(user, token, ...rest);
      // });
      //
      // the session is automatically loaded once the client is configured
      // but if you ever need to switch user sessions you can
      //
      // import { Auth } from '@elegante/sdk';
      // Auth.become('session-token').then(({user, token, ...rest}) => {
      //   console.log(user, token, ...rest);
      // });

      this.session = response;
      this.signUpError = null;
      this.cdr.markForCheck();

      LocalStorage.set('session', response);
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

      // stores the session object the way you need if you want
      // but it's not needed if you just want to grab
      // the current user in session, you can just
      //
      // import { Auth } from '@elegante/sdk';
      // Auth.current().then(({user, token, ...rest}) => {
      //   console.log(user, token, ...rest);
      // });
      //
      // the session is automatically loaded once the client is configured
      // but if you ever need to switch user sessions you can
      //
      // import { Auth } from '@elegante/sdk';
      // Auth.become('session-token').then(({user, token, ...rest}) => {
      //   console.log(user, token, ...rest);
      // });

      this.session = response;
      this.signInError = undefined;
      this.cdr.markForCheck();

      LocalStorage.set('session', response);

      /**
       * load a protected function
       * by default all functions requires a valid user session token
       */
      this.loadLatestUsers();
    } catch (err) {
      console.error(err);
      this.signInError = err;
      this.cdr.markForCheck();
    }
  }

  async signOut() {
    await Auth.signOut();
    LocalStorage.unset('session');
    this.session = undefined;
    this.cdr.markForCheck();
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

  loadLatestUsers() {
    runFunction<User[]>('getLatestUsers')
      .then((users) => {
        this.users = users ?? [];
        this.cdr.markForCheck();
      })
      .catch((err) => console.error(err));
  }
}
