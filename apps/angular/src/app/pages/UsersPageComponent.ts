import { ChangeDetectionStrategy, Component } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { lucideChevronLeft } from '@ng-icons/lucide';
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
  providers: [provideIcons({ lucideChevronLeft })],
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
      <div class="w-full flex items-center mx-4">
        @if (syncing()) {
        <div class="mr-3">
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
        <span>Manage Users ({{ table.total() }})</span>
      </div>
    </div>
    <div class="px-4 py-2.5">
      <users-table #table></users-table>
    </div>
  `,
})
export class UsersPageComponent {
  syncing = toSignal(insta.syncing);
}
