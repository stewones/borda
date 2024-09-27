import { liveQuery } from 'dexie';
import {
  delay,
  from,
  of,
} from 'rxjs';

import {
  ChangeDetectionStrategy,
  Component,
  computed,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { provideIcons } from '@ng-icons/core';
import {
  lucideCloudLightning,
  lucideLoader,
} from '@ng-icons/lucide';
import {
  HlmAlertDescriptionDirective,
  HlmAlertDirective,
  HlmAlertIconDirective,
  HlmAlertTitleDirective,
} from '@spartan-ng/ui-alert-helm';
import {
  HlmAvatarComponent,
  HlmAvatarFallbackDirective,
} from '@spartan-ng/ui-avatar-helm';
import { HlmButtonDirective } from '@spartan-ng/ui-button-helm';
import { HlmIconComponent } from '@spartan-ng/ui-icon-helm';
import { BrnSeparatorComponent } from '@spartan-ng/ui-separator-brain';
import { HlmSeparatorDirective } from '@spartan-ng/ui-separator-helm';

import { insta } from '../borda';
import { LoginFormComponent } from '../components/LoginFormComponent';

@Component({
  standalone: true,
  selector: 'app-home-page',
  imports: [
    RouterLink,
    HlmAlertTitleDirective,
    HlmAlertIconDirective,
    HlmAlertDescriptionDirective,
    HlmAlertDirective,
    HlmIconComponent,
    HlmSeparatorDirective,
    HlmAvatarComponent,
    HlmAvatarFallbackDirective,
    BrnSeparatorComponent,
    HlmButtonDirective,
    LoginFormComponent,
  ],
  providers: [provideIcons({ lucideCloudLightning, lucideLoader })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: ``,
  template: `
    <div class="p-4 flex flex-col items-center justify-center h-screen">
      @if (display()) {
      <div hlmAlert class="max-w-sm">
        <h4 hlmAlertTitle class="inline-flex items-center">
          <hlm-icon
            hlmAlertIcon
            name="lucideCloudLightning"
            class="w-5 mr-1.5"
          />
          Instante
        </h4>
        <p hlmAlertDesc class="mt-2 px-2">
          Instante helps you create offline-first, collaborative apps using Bun,
          Elysia, MongoDB, and IndexedDB.
        </p>
      </div>
      @if (session().token) {
      <div class="grid grid-cols-2 gap-2 mt-4 w-full max-w-sm">
        <div
          hlmAlert
          class="p-4 row-span-2 flex flex-col items-center justify-center"
        >
          <div class="h-5"></div>
          <div class="flex flex-col items-center justify-center">
            <hlm-avatar>
              <span
                class="bg-[#FD005B] text-white text-sm font-bold p-2 w-10 h-10"
                hlmAvatarFallback
              >
                {{ nameInitials() }}
              </span>
            </hlm-avatar>

            <p class="mt-2 text-center text-sm">
              {{ session().user.name }}
            </p>
            <p class="mt-0 text-muted-foreground text-center text-xs">
              {{ session().user.email }}
            </p>
          </div>

          <button
            hlmBtn
            variant="link"
            size="sm"
            class="mt-2 w-full px-0 py-0 text-xs flex flex-col items-center justify-start text-muted-foreground"
            (click)="logout()"
          >
            Logout
          </button>
        </div>
        <div hlmAlert>
          <a
            hlmBtn
            routerLink="/orgs"
            variant="link"
            class="w-full px-0 inline-block text-right"
          >
            Manage Orgs <br />
            <span class="text-muted-foreground text-xs">
              {{ totalOrgs() }}
            </span>
          </a>
        </div>
        <div hlmAlert>
          <a
            hlmBtn
            routerLink="/users"
            variant="link"
            class="w-full px-0 inline-block text-right"
          >
            Manage Users<br />
            <span class="text-muted-foreground text-xs">
              {{ totalUsers() }}
            </span>
          </a>
        </div>
        <div hlmAlert>
          <a
            hlmBtn
            routerLink="/users"
            variant="link"
            class="w-full px-0 inline-block text-left"
          >
            Manage Posts<br />
            <span class="text-muted-foreground text-xs">
              {{ totalPosts() }}
            </span>
          </a>
        </div>
        <div hlmAlert>
          <a
            hlmBtn
            routerLink="/users"
            variant="link"
            class="w-full px-0 inline-block text-right"
          >
            Manage Comments<br />
            <span class="text-muted-foreground text-xs">
              {{ totalComments() }}
            </span>
          </a>
        </div>
      </div>
      } @else{
      <login-form class="block w-full max-w-sm my-2"></login-form>
      } }
    </div>
  `,
})
export class HomePageComponent {
  display = toSignal(of(true).pipe(delay(100)), {
    initialValue: false,
  });

  totalUsers = toSignal(from(liveQuery(() => insta.count('users', {}))), {
    initialValue: 0,
  });

  totalOrgs = toSignal(from(liveQuery(() => insta.count('orgs', {}))), {
    initialValue: 0,
  });

  totalPosts = toSignal(from(liveQuery(() => insta.count('posts', {}))), {
    initialValue: 0,
  });

  totalComments = toSignal(from(liveQuery(() => insta.count('comments', {}))), {
    initialValue: 0,
  });

  session = toSignal(from(liveQuery(() => insta.cache.get('session'))), {
    initialValue: insta.cache.default('session'),
  });

  nameInitials = computed(() => {
    const { name } = this.session().user;
    return name
      .split(' ')
      .map((n) => n[0].toUpperCase())
      .slice(0, 2)
      .join('');
  });

  async logout() {
    await Promise.allSettled([
      insta.cloud.run('logout'),
      insta.cloud.unsync(),
      insta.cache.clear(),
    ]);
  }
}
