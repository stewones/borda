import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import {
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

import { createClient, query } from '@elegante/sdk';
import { map, Subject, takeUntil, tap } from 'rxjs';

console.time('startup');

const client = createClient({
  apiKey: 'ELEGANTE_SERVER',
  serverURL: 'http://localhost:3135/server',
  debug: true,
});

interface Sale {
  objectId: string;
  total: number;
}

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  selector: 'elegante-root',
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
    <button (click)="increase()" *ngIf="totalOnce$ | async">
      Increase Total:
      {{ (total$ | async) ?? total }}
    </button>
    <button (click)="reload()">Next Total: {{ total }}</button>
    <button (click)="unsubscribe()">Unsubscribe Realtime</button>
    <button (click)="subscribe()">Subscribe Realtime</button>

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
  `,
})
export class AppComponent {
  unsubscribe$ = new Subject<void>();

  // total once + realtime
  total = 0;
  total$ = this.realtime$();

  // total once
  totalOnce$ = query<Sale>()
    .collection('Sale')
    .filter({
      objectId: {
        $eq: 'kpg5YGSEBn',
      },
    })
    .once()
    .pipe(
      map(({ docs }) => docs && docs[0]),
      map((sale) => sale?.total ?? 0),
      tap((total) => (this.total = total))
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

  constructor() {
    client.ping().then(() => console.timeEnd('startup'));
  }

  ngOnDestroy() {}
  ngOnInit() {}

  realtime$() {
    return query<Sale>()
      .collection('Sale')
      .filter({
        objectId: {
          $eq: 'kpg5YGSEBn',
        },
      })
      .on('update')
      .pipe(
        map(({ doc }) => doc?.total ?? 0),
        takeUntil(this.unsubscribe$)
      );
  }

  subscribe() {
    this.unsubscribe();
    this.total$ = this.realtime$();
  }

  unsubscribe() {
    this.unsubscribe$.next();
  }

  increase() {
    ++this.total;
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
        total: this.total,
      });
  }

  reload() {
    window.location.reload();
  }

  signUp() {
    const form = this.signUpForm.getRawValue();
    console.log(form);
  }

  signIn() {}
}
