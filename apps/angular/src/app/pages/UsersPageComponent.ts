import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { lucideChevronLeft } from '@ng-icons/lucide';
import { HlmButtonDirective } from '@spartan-ng/ui-button-helm';
import { HlmIconComponent, provideIcons } from '@spartan-ng/ui-icon-helm';
import { BrnSeparatorComponent } from '@spartan-ng/ui-separator-brain';
import { HlmSeparatorDirective } from '@spartan-ng/ui-separator-helm';

import { UsersTableComponent } from '../components/UsersTableComponent';

@Component({
  standalone: true,
  selector: 'app-offline-page',
  imports: [
    RouterLink,
    HlmIconComponent,
    HlmButtonDirective,
    HlmSeparatorDirective,
    BrnSeparatorComponent,
    UsersTableComponent,
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
      <span class="mx-4">Manage Users ({{ table.total() }})</span>
    </div>
    <div class="px-4 py-2.5">
      <users-table #table></users-table>
    </div>
  `,
})
export class UsersPageComponent {
  async ngOnInit() {}
}
