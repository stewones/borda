import hotkeys from 'hotkeys-js';

import {
  ChangeDetectionStrategy,
  Component,
  signal,
} from '@angular/core';

import { HlmButtonDirective } from '@spartan-ng/ui-button-helm';
import { BrnMenuTriggerDirective } from '@spartan-ng/ui-menu-brain';
import {
  HlmMenuBarComponent,
  HlmMenuBarItemDirective,
  HlmMenuComponent,
  HlmMenuGroupComponent,
  HlmMenuItemCheckboxDirective,
  HlmMenuItemCheckComponent,
  HlmMenuItemDirective,
  HlmMenuItemIconDirective,
  HlmMenuItemRadioComponent,
  HlmMenuItemRadioDirective,
  HlmMenuItemSubIndicatorComponent,
  HlmMenuLabelComponent,
  HlmMenuSeparatorComponent,
  HlmMenuShortcutComponent,
  HlmSubMenuComponent,
} from '@spartan-ng/ui-menu-helm';

import { UsersDialogComponent } from './UsersDialogComponent';

@Component({
  standalone: true,
  selector: 'users-menu-bar',
  imports: [
    UsersDialogComponent,
    BrnMenuTriggerDirective,
    HlmMenuComponent,
    HlmMenuBarComponent,
    HlmSubMenuComponent,
    HlmMenuItemDirective,
    HlmMenuItemSubIndicatorComponent,
    HlmMenuLabelComponent,
    HlmMenuShortcutComponent,
    HlmMenuSeparatorComponent,
    HlmMenuItemIconDirective,
    HlmMenuBarItemDirective,
    HlmMenuItemCheckComponent,
    HlmMenuItemRadioComponent,
    HlmMenuGroupComponent,
    HlmButtonDirective,
    HlmMenuItemCheckboxDirective,
    HlmMenuItemRadioDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: ``,
  template: `
    <hlm-menu-bar class="w-full sm:w-fit">
      <button hlmMenuBarItem [brnMenuTriggerFor]="file">File</button>
      <button hlmMenuBarItem [brnMenuTriggerFor]="edit">Edit</button>
      <button hlmMenuBarItem [brnMenuTriggerFor]="view">View</button>
      <button hlmMenuBarItem [brnMenuTriggerFor]="profiles">Profiles</button>
    </hlm-menu-bar>

    <ng-template #file>
      <hlm-menu variant="menubar" class="w-48">
        <hlm-menu-group>
          <button hlmMenuItem (click)="showUsersDialog.set(true)">
            New User
            <hlm-menu-shortcut>⌘N</hlm-menu-shortcut>
          </button>
          <button hlmMenuItem disabled>
            New Organization
            <hlm-menu-shortcut>⌘O</hlm-menu-shortcut>
          </button>
        </hlm-menu-group>

        <hlm-menu-separator />

        <button hlmMenuItem [brnMenuTriggerFor]="share">
          Share
          <hlm-menu-item-sub-indicator />
        </button>

        <hlm-menu-separator />

        <button hlmMenuItem>
          Print...
          <hlm-menu-shortcut>⌘P</hlm-menu-shortcut>
        </button>
      </hlm-menu>
    </ng-template>
    <ng-template #share>
      <hlm-sub-menu>
        <button hlmMenuItem>Email link</button>
        <button hlmMenuItem>Messages</button>
        <button hlmMenuItem>Notes</button>
      </hlm-sub-menu>
    </ng-template>

    <ng-template #edit>
      <hlm-menu variant="menubar" class="w-48">
        <hlm-menu-group>
          <button hlmMenuItem>
            Undo
            <hlm-menu-shortcut>⌘Z</hlm-menu-shortcut>
          </button>
          <button hlmMenuItem>
            Redo
            <hlm-menu-shortcut>⇧⌘Z</hlm-menu-shortcut>
          </button>
        </hlm-menu-group>

        <hlm-menu-separator />

        <button hlmMenuItem [brnMenuTriggerFor]="find">
          Share
          <hlm-menu-item-sub-indicator />
        </button>

        <hlm-menu-separator />

        <button hlmMenuItem>Cut</button>
        <button hlmMenuItem>Copy</button>
        <button hlmMenuItem>Paste</button>
      </hlm-menu>
    </ng-template>
    <ng-template #find>
      <hlm-sub-menu>
        <button hlmMenuItem>Search the web</button>
        <hlm-menu-separator />
        <button hlmMenuItem>Find...</button>
        <button hlmMenuItem>Find Next</button>
        <button hlmMenuItem>Find Previous</button>
      </hlm-sub-menu>
    </ng-template>

    <ng-template #view>
      <hlm-menu variant="menubar">
        <button hlmMenuItemCheckbox>
          <hlm-menu-item-check />
          Always Show Bookmarks Bar
        </button>
        <button hlmMenuItemCheckbox checked>
          <hlm-menu-item-check />
          Always Show Full URLs
        </button>
        <hlm-menu-separator />
        <button inset hlmMenuItem>
          Reload
          <hlm-menu-shortcut>⌘R</hlm-menu-shortcut>
        </button>
        <button inset disabled hlmMenuItem>
          Force Reload
          <hlm-menu-shortcut>⇧⌘R</hlm-menu-shortcut>
        </button>
        <hlm-menu-separator />
        <button inset hlmMenuItem>Toggle Fullscreen</button>
        <hlm-menu-separator />
        <button inset hlmMenuItem>Hide Sidebar</button>
      </hlm-menu>
    </ng-template>

    <ng-template #profiles>
      <hlm-menu variant="menubar" class="w-48">
        <button hlmMenuItemRadio>
          <hlm-menu-item-radio />
          Andy
        </button>
        <button hlmMenuItemRadio checked>
          <hlm-menu-item-radio />
          Benoit
        </button>
        <button hlmMenuItemRadio>
          <hlm-menu-item-radio />
          Lewis
        </button>
        <hlm-menu-separator />
        <button inset hlmMenuItem>Edit...</button>
        <hlm-menu-separator />
        <button inset hlmMenuItem>Add Profile...</button>
      </hlm-menu>
    </ng-template>

    <users-dialog
      [open]="showUsersDialog()"
      (onClose)="showUsersDialog.set(false)"
    ></users-dialog>
  `,
})
export class UsersMenuBarComponent {
  showUsersDialog = signal(false);

  ngOnInit() {
    hotkeys('cmd+u', (event, handler) => {
      // Prevent the default refresh event under WINDOWS system
      event.preventDefault();
      this.showUsersDialog.set(true);
    });
  }
}
