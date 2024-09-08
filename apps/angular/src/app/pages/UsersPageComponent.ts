import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { lucideChevronLeft } from '@ng-icons/lucide';
import { tablerWifi, tablerWifiOff } from '@ng-icons/tabler-icons';
import { HlmButtonDirective } from '@spartan-ng/ui-button-helm';
import { HlmIconComponent, provideIcons } from '@spartan-ng/ui-icon-helm';
import { BrnSeparatorComponent } from '@spartan-ng/ui-separator-brain';
import { HlmSeparatorDirective } from '@spartan-ng/ui-separator-helm';
import { BrnTooltipContentDirective } from '@spartan-ng/ui-tooltip-brain';
import {
  HlmTooltipComponent,
  HlmTooltipTriggerDirective,
} from '@spartan-ng/ui-tooltip-helm';

import { insta } from '../borda';
import { PulsingDot } from '../components/PulsingDot';
import { UsersTableComponent } from '../components/UsersTableComponent';

@Component({
  standalone: true,
  selector: 'app-offline-page',
  imports: [
    RouterLink,
    HlmIconComponent,
    HlmButtonDirective,
    HlmSeparatorDirective,
    BrnTooltipContentDirective,
    HlmTooltipTriggerDirective,
    HlmTooltipComponent,
    BrnSeparatorComponent,
    UsersTableComponent,
    PulsingDot,
  ],
  providers: [provideIcons({ lucideChevronLeft, tablerWifiOff, tablerWifi })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: ``,
  template: `
    <div class="h-5 flex items-center text-sm my-3.5 -ml-1">
      <div>
        <a hlmBtn routerLink="/" variant="link" class="text-muted-foreground">
          <hlm-icon size="sm" name="lucideChevronLeft" />
          <span class="ml-2">Back</span>
        </a>
      </div>
      <brn-separator decorative hlmSeparator orientation="vertical" />
      <div class="w-full flex items-center mx-4 truncate">
        @if (syncing()) {
        <div class="mr-3 ml-1">
          <hlm-tooltip>
            <span hlmTooltipTrigger>
              <pulsing-dot></pulsing-dot>
            </span>
            <span *brnTooltipContent class="text-xs text-muted-foreground">
              Syncronizing data for the first time...
            </span>
          </hlm-tooltip>
        </div>
        }
        <span class="truncate">Manage Users ({{ table.total() }})</span>
      </div>
      <div class="mx-4">
        <hlm-tooltip>
          <span hlmTooltipTrigger>
            <button
              hlmBtn
              size="sm"
              variant="ghost"
              class="whitespace-nowrap text-xs text-muted-foreground"
            >
              <hlm-icon
                size="base"
                [name]="online() ? 'tablerWifi' : 'tablerWifiOff'"
              />
              <span class="ml-2">{{ online() ? 'Online' : 'Offline' }}</span>
            </button>
          </span>
          <span
            *brnTooltipContent
            class="text-xs text-right text-muted-foreground"
            [innerHTML]="
              online()
                ? 'You are online.<br/> try to set your computer offline<br/> to see what happens 😉'
                : 'You are offline.<br/> try to set your computer online<br/> to see the magic 😛'
            "
          >
          </span>
        </hlm-tooltip>
      </div>
    </div>
    <div class="px-4 py-2.5">
      <users-table #table></users-table>
    </div>
  `,
})
export class UsersPageComponent {
  syncing = toSignal(insta.syncing);

  online = signal(navigator.onLine);

  ngOnInit() {
    window.addEventListener('online', this.updateOnlineStatus.bind(this));
    window.addEventListener('offline', this.updateOnlineStatus.bind(this));
  }

  ngOnDestroy() {
    window.removeEventListener('online', this.updateOnlineStatus.bind(this));
    window.removeEventListener('offline', this.updateOnlineStatus.bind(this));
  }

  updateOnlineStatus() {
    this.online.set(navigator.onLine);
  }
}
