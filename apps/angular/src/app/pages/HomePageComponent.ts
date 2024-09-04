import { liveQuery } from 'dexie';
import { from } from 'rxjs';

import { ChangeDetectionStrategy, Component } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { provideIcons } from '@ng-icons/core';
import { lucideBox } from '@ng-icons/lucide';
import {
  HlmAlertDescriptionDirective,
  HlmAlertDirective,
  HlmAlertIconDirective,
  HlmAlertTitleDirective,
} from '@spartan-ng/ui-alert-helm';
import { HlmButtonDirective } from '@spartan-ng/ui-button-helm';
import { HlmIconComponent } from '@spartan-ng/ui-icon-helm';
import { BrnSeparatorComponent } from '@spartan-ng/ui-separator-brain';
import { HlmSeparatorDirective } from '@spartan-ng/ui-separator-helm';

import { insta } from '../borda';

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
    BrnSeparatorComponent,
    HlmButtonDirective,
  ],
  providers: [provideIcons({ lucideBox })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: ``,
  template: `
    <div class="p-4">
      <div hlmAlert>
        <hlm-icon hlmAlertIcon name="lucideBox" />
        <h4 hlmAlertTitle>Introducing borda.js</h4>
        <p hlmAlertDesc>
          borda.js helps you build offline-first, real-time and collaborative
          apps using Bun, Elysia, MongoDB and IndexedDB.
        </p>
      </div>

      <div class="flex items-center h-5 text-sm mx-2 my-2">
        <div>
          <a hlmBtn routerLink="/users" variant="link">
            Manage Users ({{ totalUsers() }})
          </a>
        </div>
        <brn-separator decorative hlmSeparator orientation="vertical" />
        <div>
          <a hlmBtn routerLink="/old" variant="link">Old Stuff</a>
        </div>
      </div>
    </div>
  `,
})
export class HomePageComponent {
  totalUsers = toSignal(from(liveQuery(() => insta.count('users', {}))), {
    initialValue: 0,
  });

  ngOnInit() {}
}
