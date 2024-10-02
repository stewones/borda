import { ChangeDetectionStrategy, Component } from '@angular/core';

import { delay, pointer } from '@borda/client';

import { faker } from '@faker-js/faker';
import { provideIcons } from '@ng-icons/core';
import { lucideUser } from '@ng-icons/lucide';
import { tablerDots } from '@ng-icons/tabler-icons';
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

import { insta } from '../borda';

@Component({
  standalone: true,
  selector: 'home-primary-options',
  imports: [
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
      tablerDots,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: ``,
  template: `
    <button hlmBtn variant="ghost" size="icon" [brnMenuTriggerFor]="menu">
      <hlm-icon size="base" name="tablerDots" />
    </button>
    <ng-template #menu>
      <hlm-menu class="w-56">
        <hlm-menu-label>Seed data</hlm-menu-label>
        <hlm-menu-separator />
        <hlm-menu-group>
          <button hlmMenuItem (click)="seedUsers(50)">
            <hlm-icon name="lucideUser" hlmMenuIcon />
            <span>Add 50 users with orgs</span>
          </button>
        </hlm-menu-group>
      </hlm-menu>
    </ng-template>
  `,
})
export class HomePrimaryOptionsComponent {
  async seedUsers(count: number) {
    const orgs = [];
    for (let i = 0; i < count; i++) {
      await delay(1);
      const org = await insta.mutate('orgs').add({
        name: faker.company.name(),
      });
      orgs.push(org);
    }

    const emailSet = new Set<string>();

    for (const org of orgs) {
      await delay(1);

      let email: string;
      do {
        email = faker.internet.email().toLowerCase();
      } while (emailSet.has(email));
      emailSet.add(email);

      await insta.mutate('users').add({
        name: faker.person.fullName(),
        email,
        _p_org: pointer('orgs', org._id),
      });
    }
  }
}
