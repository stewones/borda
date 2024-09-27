import { toast } from 'ngx-sonner';
import { filter } from 'rxjs';

import { Component, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

import { lucideCheck, lucideChevronDown } from '@ng-icons/lucide';
import { HlmButtonDirective } from '@spartan-ng/ui-button-helm';
import {
  HlmCardContentDirective,
  HlmCardDescriptionDirective,
  HlmCardDirective,
  HlmCardFooterDirective,
  HlmCardHeaderDirective,
  HlmCardTitleDirective,
} from '@spartan-ng/ui-card-helm';
import { HlmIconComponent, provideIcons } from '@spartan-ng/ui-icon-helm';
import { HlmInputDirective } from '@spartan-ng/ui-input-helm';
import { HlmLabelDirective } from '@spartan-ng/ui-label-helm';

import { insta } from '../borda';

type Framework = { label: string; value: string };

@Component({
  selector: 'login-form',
  standalone: true,
  imports: [
    HlmIconComponent,
    HlmCardDirective,
    HlmCardHeaderDirective,
    HlmCardTitleDirective,
    HlmCardDescriptionDirective,
    HlmCardContentDirective,
    HlmLabelDirective,
    HlmInputDirective,
    HlmCardFooterDirective,
    HlmButtonDirective,
    FormsModule,
    ReactiveFormsModule,
  ],
  providers: [provideIcons({ lucideCheck, lucideChevronDown })],
  template: `
    <form
      hlmCard
      [formGroup]="action() === 'login' ? loginForm : signupForm"
      (ngSubmit)="action() === 'login' ? login() : signup()"
      class="flex flex-col gap-2"
    >
      <div hlmCardHeader>
        <h3 hlmCardTitle>
          {{ action() === 'login' ? 'Sign In' : 'Sign Up' }}
        </h3>
        <p hlmCardDescription>
          {{
            action() === 'login'
              ? 'Login to continue testing the demo app'
              : 'Create an account and start testing'
          }}
        </p>
      </div>
      <p hlmCardContent>
        @if (action() === 'signup') {
        <label class="block" hlmLabel>
          <span class="text-sm text-muted-foreground">Name</span>
          <input
            formControlName="name"
            hlmInput
            class="mt-2.5 w-full"
            placeholder=""
            type="text"
          />
        </label>
        }

        <label class="block" hlmLabel>
          <span class="text-sm text-muted-foreground">Email</span>
          <input
            formControlName="email"
            hlmInput
            class="mt-2.5 w-full"
            placeholder=""
            type="email"
          />
        </label>

        <label class="block" hlmLabel>
          <span class="text-sm text-muted-foreground">Password</span>
          <input
            formControlName="password"
            hlmInput
            class="mt-2.5 w-full"
            placeholder=""
            type="password"
          />
        </label>
      </p>
      <div hlmCardFooter class="justify-between">
        <button
          type="submit"
          hlmBtn
          [disabled]="
            action() === 'login' ? !loginForm.valid : !signupForm.valid
          "
        >
          {{ action() === 'login' ? 'Login' : 'Submit' }}
        </button>
        <button
          type="button"
          hlmBtn
          variant="ghost"
          (click)="action.set(action() === 'login' ? 'signup' : 'login')"
        >
          {{ action() === 'login' ? 'Create Account' : 'Sign In' }}
        </button>
      </div>
    </form>
  `,
})
export class LoginFormComponent {
  errors$ = insta.errors
    .pipe(
      takeUntilDestroyed(),
      filter((error) => ['login', 'sign-up'].includes(error.fn ?? ''))
    )
    .subscribe((error) =>
      toast(error.message, {
        description: error.errors[0]?.message || error.summary,
      })
    );

  loginForm = new FormGroup({
    email: new FormControl<string>('', [Validators.required, Validators.email]),
    password: new FormControl<string>('', [Validators.required]),
  });

  signupForm = new FormGroup({
    name: new FormControl<string>('', [Validators.required]),
    email: new FormControl<string>('', [Validators.required, Validators.email]),
    password: new FormControl<string>('', [Validators.required]),
  });

  action = signal<'login' | 'signup'>('login');

  async login() {
    if (!this.loginForm.valid) {
      return;
    }
    try {
      const { email, password } = this.loginForm.value;
      const { token, user } = await insta.cloud.run('login', {
        email: email?.toLowerCase() ?? '',
        password: password ?? '',
      });
      await insta.cloud.become({ token, user });
      await insta.cloud.sync();
    } catch (err) {
      console.error('error', err);
    }
  }

  async signup() {
    if (!this.signupForm.valid) {
      return;
    }
    try {
      const { name, email, password } = this.signupForm.value;
      const { token, user } = await insta.cloud.run('sign-up', {
        name: name ?? '',
        email: email?.toLowerCase() ?? '',
        password: password ?? '',
      });

      await insta.cloud.become({ token, user });
      await insta.cloud.sync();
    } catch (error) {
      console.error('error', error);
    }
  }
}
