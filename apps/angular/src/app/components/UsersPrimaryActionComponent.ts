import hotkeys from 'hotkeys-js';

import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

import { Org, User } from '@/common';
import { provideIcons } from '@ng-icons/core';
import { lucideUser } from '@ng-icons/lucide';
import { tablerBuilding, tablerDots } from '@ng-icons/tabler-icons';
import { HlmButtonDirective } from '@spartan-ng/ui-button-helm';
import { HlmIconComponent } from '@spartan-ng/ui-icon-helm';
import { BrnMenuTriggerDirective } from '@spartan-ng/ui-menu-brain';
import {
  HlmMenuComponent,
  HlmMenuGroupComponent,
  HlmMenuItemDirective,
  HlmMenuItemIconDirective,
  HlmMenuItemSubIndicatorComponent,
  HlmMenuLabelComponent,
  HlmMenuSeparatorComponent,
  HlmMenuShortcutComponent,
  HlmSubMenuComponent,
} from '@spartan-ng/ui-menu-helm';

import { OrgsDialogComponent } from './OrgsDialogComponent';
import { UsersDialogComponent } from './UsersDialogComponent';

@Component({
  standalone: true,
  selector: 'users-primary-action',
  imports: [
    UsersDialogComponent,
    OrgsDialogComponent,
    HlmMenuComponent,
    HlmSubMenuComponent,
    HlmMenuItemDirective,
    HlmMenuItemSubIndicatorComponent,
    HlmMenuLabelComponent,
    HlmMenuShortcutComponent,
    HlmMenuSeparatorComponent,
    HlmMenuItemIconDirective,
    HlmMenuGroupComponent,
    HlmButtonDirective,
    HlmIconComponent,
    BrnMenuTriggerDirective,
  ],
  providers: [
    provideIcons({
      lucideUser,
      tablerBuilding,
      tablerDots,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: ``,
  template: `
    <button hlmBtn variant="outline" align="end" [brnMenuTriggerFor]="menu">
      <span>More</span>
      <hlm-icon size="sm" name="tablerDots" class="ml-2" />
    </button>
    <ng-template #menu>
      <hlm-menu class="w-56">
        <hlm-menu-label>Create</hlm-menu-label>
        <hlm-menu-separator />
        <hlm-menu-group>
          <button hlmMenuItem (click)="showUsersDialog.set(true)">
            <hlm-icon name="lucideUser" hlmMenuIcon />
            <span>User</span>
            <hlm-menu-shortcut>⌘U</hlm-menu-shortcut>
          </button>

          <button hlmMenuItem (click)="showOrgsDialog.set(true)">
            <hlm-icon name="tablerBuilding" hlmMenuIcon />
            <span>Organization</span>
            <hlm-menu-shortcut>⌘O</hlm-menu-shortcut>
          </button>
        </hlm-menu-group>
      </hlm-menu>
    </ng-template>

    <users-dialog
      [open]="showUsersDialog()"
      (onClose)="showUsersDialog.set(false)"
      [entry]="showUsersDialogEntry()"
    ></users-dialog>
    <orgs-dialog
      [open]="showOrgsDialog()"
      (onClose)="showOrgsDialog.set(false)"
      [entry]="showOrgsDialogEntry()"
    ></orgs-dialog>
  `,
})
export class UsersPrimaryActionComponent {
  showUsersDialog = signal(false);
  showUsersDialogEntry = signal<User>({} as User);
  showOrgsDialog = signal(false);
  showOrgsDialogEntry = signal<Org>({} as Org);

  ngOnInit() {
    hotkeys('cmd+u', (event, handler) => {
      event.preventDefault();
      this.showUsersDialog.set(true);
    });
    hotkeys('cmd+o', (event, handler) => {
      event.preventDefault();
      this.showOrgsDialog.set(true);
    });
  }
}
