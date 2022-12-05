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
  Validators,
} from '@angular/forms';

import { createClient, query, Auth, Session } from '@elegante/sdk';
import { from, map, of, Subject, Subscription, takeUntil, tap } from 'rxjs';

console.time('startup');

const client = createClient({
  apiKey: 'ELEGANTE_SERVER',
  serverURL: 'http://localhost:3135/server',
  debug: false,
});

interface Sale {
  objectId: string;
  total: number;
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
    `,
  ],
  template: `
    <button
      (click)="increase()"
      *ngIf="totalOnce$ | async"
      title="click to increase the counter. which should reflect here in realtime if subscribed. experiment open many tabs at same time and see the changes reflect."
    >
      Increase count (realtime):
      {{ total }}
    </button>
    <button (click)="reload()" title="click to refresh the page">
      Next Total (local): {{ totalNext }}
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

    <h2>Sign In</h2>
    <form [formGroup]="signInForm" (ngSubmit)="signIn()">
      <label for="email">email </label>
      <input id="email" type="text" formControlName="email" />
      <label for="password">password: </label>
      <input id="password" type="text" formControlName="password" />
      <button type="submit" [disabled]="signInForm.invalid">Login</button>
    </form>
    {{ error | json }} {{ session | json }}
  `,
})
export class AppComponent {
  total = 0;
  totalNext = 0;

  unsubscribe$ = new Subject<void>();
  subscription$: { [key: string]: Subscription } = {};

  // total once query
  totalOnce$ = from(
    query<Sale>()
      .collection('Sale')
      .filter({
        objectId: {
          $eq: 'kpg5YGSEBn',
        },
      })
      .findOne()
  ).pipe(
    // map(({ docs }) => docs && docs[0]),
    map((sale) => sale?.total ?? 0),
    tap((total) => {
      this.total = total;
      this.totalNext = total;
    }),
    tap(() => this.cdr.markForCheck())
  );

  signUpForm = new FormGroup({
    name: new FormControl('', [Validators.required]),
    email: new FormControl('', [Validators.email]),
    password: new FormControl('', [Validators.required]),
  });

  signInForm = new FormGroup({
    email: new FormControl('', [Validators.required]),
    password: new FormControl('', [Validators.required]),
  });

  session: Session | undefined = undefined;

  error: any;

  constructor(private cdr: ChangeDetectorRef) {
    client.ping().then(() => console.timeEnd('startup'));
  }

  ngOnDestroy() {}

  ngOnInit() {
    this.subscribe();
  }

  // realtime$() {
  //   return query<Sale>()
  //     .collection('Sale')
  //     .filter({
  //       objectId: {
  //         $eq: 'kpg5YGSEBn',
  //       },
  //     })
  //     .on('update')
  //     .pipe(
  //       takeUntil(this.unsubscribe$),
  //       map(({ doc }) => doc?.total ?? 0),
  //       tap((total) => (this.total = total)),
  //       tap(() => this.cdr.markForCheck())
  //     );
  // }

  subscribe() {
    this.unsubscribe();
    this.subscription$['update'] = query<Sale>('Sale')
      .filter({
        objectId: {
          $eq: 'kpg5YGSEBn',
        },
      })
      .on('update')
      .subscribe(({ doc }) => {
        const newTotal = doc?.total ?? 0;
        console.log('doc update', doc);
        if (newTotal > 0 && this.total !== newTotal) {
          this.total = doc?.total ?? 0;
          this.cdr.markForCheck();
        }
      });

    // this.subscription$['insert'] = query('Sale')
    //   .on('insert')
    //   .subscribe(({ doc }) => console.log('inserted new doc', doc));

    // this.subscription$['delete'] = query('Sale')
    //   .on('delete')
    //   .subscribe(({ doc, ...rest }) => console.log('deleted doc', doc, rest));
  }

  unsubscribe() {
    for (const key in this.subscription$) {
      this.subscription$[key].unsubscribe();
    }
  }

  increase() {
    this.totalNext = this.totalNext + 1;
    this.cdr.markForCheck();
    query<{
      objectId: string;
      total: number;
    }>()
      .collection('Sale')
      .filter({
        objectId: {
          $eq: 'kpg5YGSEBn',
        },
      })
      .update({
        total: this.totalNext,
      });
  }

  reload() {
    window.location.reload();
  }

  signUp() {
    // Auth.signUp(name, email, password);

    const form = this.signUpForm.getRawValue();
    console.log('@todo', form);
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

      const { user, sessionToken, ...rest } = response;

      // stores the session object the way you need if you want
      // but it's not needed if you just want to grab
      // the current user in session, you can just
      //
      // import { Auth } from '@elegante/sdk';
      // Auth.current().then(({user, sessionToken, ...rest}) => {
      //   console.log(user, sessionToken, ...rest);
      // });
      //
      // the session is automatically loaded once the client is configured
      // but if you ever need to switch user sessions you can
      //
      // import { Auth } from '@elegante/sdk';
      // Auth.become('session-token').then(({user, sessionToken, ...rest}) => {
      //   console.log(user, sessionToken, ...rest);
      // });

      this.session = response;
      this.error = {};
      this.cdr.markForCheck();
    } catch (err) {
      console.error(err);
      this.error = err;
      this.cdr.markForCheck();
    }
  }

  signBecome() {
    // Auth.become(token);
  }
}
