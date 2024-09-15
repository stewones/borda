import { liveQuery } from 'dexie';
import { DateFnsModule } from 'ngx-date-fns';
import { toast } from 'ngx-sonner';
import { derivedAsync } from 'ngxtension/derived-async';
import { from, map, tap } from 'rxjs';

import { SelectionModel } from '@angular/cdk/collections';
import {
  DecimalPipe,
  NgClass,
  TitleCasePipe,
} from '@angular/common';
import {
  Component,
  computed,
  signal,
  TrackByFunction,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';

import { ejectPointerId } from '@borda/client';

import { Org, User } from '@/common';
import {
  lucideArrowDown,
  lucideArrowUp,
  lucideArrowUpDown,
  lucideChevronDown,
} from '@ng-icons/lucide';
import { tablerDots } from '@ng-icons/tabler-icons';
import {
  HlmButtonDirective,
  HlmButtonModule,
} from '@spartan-ng/ui-button-helm';
import {
  HlmCheckboxCheckIconComponent,
  HlmCheckboxComponent,
} from '@spartan-ng/ui-checkbox-helm';
import { HlmIconComponent, provideIcons } from '@spartan-ng/ui-icon-helm';
import { HlmInputDirective } from '@spartan-ng/ui-input-helm';
import { BrnMenuTriggerDirective } from '@spartan-ng/ui-menu-brain';
import { HlmMenuModule } from '@spartan-ng/ui-menu-helm';
import { BrnSelectModule } from '@spartan-ng/ui-select-brain';
import { HlmSelectModule } from '@spartan-ng/ui-select-helm';
import { HlmToasterComponent } from '@spartan-ng/ui-sonner-helm';
import {
  BrnTableModule,
  PaginatorState,
  useBrnColumnManager,
} from '@spartan-ng/ui-table-brain';
import { HlmTableModule } from '@spartan-ng/ui-table-helm';

import { insta } from '../borda';
import { DeleteDialog } from './DeleteDialog';
import { OrgsDialogComponent } from './OrgsDialogComponent';
import { UsersDialogComponent } from './UsersDialogComponent';
import { UsersPrimaryActionComponent } from './UsersPrimaryActionComponent';

@Component({
  standalone: true,
  selector: 'users-table',
  imports: [
    FormsModule,
    UsersPrimaryActionComponent,
    BrnMenuTriggerDirective,
    HlmMenuModule,
    BrnTableModule,
    HlmTableModule,
    HlmButtonModule,
    DateFnsModule,
    DecimalPipe,
    TitleCasePipe,
    HlmIconComponent,
    HlmInputDirective,
    HlmCheckboxCheckIconComponent,
    HlmCheckboxComponent,
    HlmToasterComponent,
    HlmButtonDirective,
    BrnSelectModule,
    HlmSelectModule,
    DeleteDialog,
    NgClass,
    UsersDialogComponent,
    OrgsDialogComponent,
  ],
  providers: [
    provideIcons({
      lucideChevronDown,
      tablerDots,
      lucideArrowUpDown,
      lucideArrowUp,
      lucideArrowDown,
    }),
  ],
  encapsulation: ViewEncapsulation.None,
  styles: `
  cdk-header-row {
   @apply rounded-t-lg;
  }
  `,
  template: `
    <div class="flex flex-col justify-between gap-4 sm:flex-row">
      <div class="flex flex-col sm:flex-row gap-4">
        <input
          hlmInput
          class="w-full md:w-80"
          placeholder="Filter by name and email"
          [(ngModel)]="search"
        />
        <users-primary-action></users-primary-action>
      </div>

      <button hlmBtn variant="outline" align="end" [brnMenuTriggerFor]="menu">
        Columns
        <hlm-icon name="lucideChevronDown" class="ml-2" size="sm" />
      </button>
      <ng-template #menu>
        <hlm-menu class="w-32">
          @for (column of columnManager.allColumns; track column.name) {
          <button
            hlmMenuItemCheckbox
            [disabled]="columnManager.isColumnDisabled(column.name)"
            [checked]="columnManager.isColumnVisible(column.name)"
            (triggered)="columnManager.toggleVisibility(column.name)"
          >
            <hlm-menu-item-check />
            <span>{{ column.label }}</span>
          </button>
          }
        </hlm-menu>
      </ng-template>
    </div>

    <brn-table
      hlm
      stickyHeader
      class="border-border mt-4 block rounded-md border overflow-auto"
      [dataSource]="entries()"
      [displayedColumns]="columnsDisplayed()"
      [trackBy]="trackByEntry"
    >
      <brn-column-def name="select" class="w-12">
        <hlm-th *brnHeaderDef>
          <hlm-checkbox
            [checked]="checkboxState()"
            (changed)="toggleEntriesSelection()"
          />
        </hlm-th>
        <hlm-td *brnCellDef="let row">
          <hlm-checkbox
            [checked]="isEntrySelected(row)"
            (changed)="toggleEntrySelection(row)"
          />
        </hlm-td>
      </brn-column-def>
      <brn-column-def name="status" class="w-40">
        <hlm-th *brnHeaderDef> Organization</hlm-th>

        <hlm-td
          truncate
          *brnCellDef="let row"
          [ngClass]="{
            'text-muted-foreground': insta.modified(row),
          }"
        >
          {{ row.org?.name || '' }}
        </hlm-td>
      </brn-column-def>
      <brn-column-def name="name" class="w-40 sm:w-48">
        <hlm-th *brnHeaderDef>
          <button
            hlmBtn
            size="sm"
            variant="ghost"
            (click)="handleNameSortChange()"
            class="-ml-3"
          >
            Name
            <hlm-icon
              class="ml-3"
              size="xs"
              [name]="
                sortName() === 'ASC'
                  ? 'lucideArrowUp'
                  : sortName() === 'DESC'
                  ? 'lucideArrowDown'
                  : 'lucideArrowUpDown'
              "
            />
          </button>
        </hlm-th>

        <hlm-td
          truncate
          *brnCellDef="let row"
          [ngClass]="{
            'text-muted-foreground': insta.modified(row),
          }"
        >
          {{ row.name }}
        </hlm-td>
      </brn-column-def>
      <brn-column-def name="email" class="w-60 flex-1">
        <hlm-th *brnHeaderDef>
          <button
            hlmBtn
            size="sm"
            variant="ghost"
            (click)="handleEmailSortChange()"
            class="-ml-3"
          >
            Email
            <hlm-icon
              class="ml-3"
              size="xs"
              [name]="
                sortEmail() === 'ASC'
                  ? 'lucideArrowUp'
                  : sortEmail() === 'DESC'
                  ? 'lucideArrowDown'
                  : 'lucideArrowUpDown'
              "
            />
          </button>
        </hlm-th>
        <hlm-td
          truncate
          *brnCellDef="let row"
          [ngClass]="{
            'text-muted-foreground': insta.modified(row),
          }"
        >
          {{ row.email }}
        </hlm-td>
      </brn-column-def>
      <brn-column-def name="updated" class="justify-end w-20">
        <hlm-th *brnHeaderDef>
          <button
            hlmBtn
            size="sm"
            variant="ghost"
            (click)="handleUpdatedSortChange()"
            class="-mr-3"
          >
            Updated
            <hlm-icon
              class="ml-3"
              size="xs"
              [name]="
                sortUpdatedAt() === 'ASC'
                  ? 'lucideArrowUp'
                  : sortUpdatedAt() === 'DESC'
                  ? 'lucideArrowDown'
                  : 'lucideArrowUpDown'
              "
            />
          </button>
        </hlm-th>
        <hlm-td
          class="font-normal whitespace-nowrap"
          *brnCellDef="let row"
          [ngClass]="{
            'text-muted-foreground': insta.modified(row),
          }"
        >
          {{ row._updated_at | dfnsParseIso | dfnsFormat : 'MMM d, HH:mm' }}
        </hlm-td>
      </brn-column-def>
      <brn-column-def name="actions" class="w-16">
        <hlm-th *brnHeaderDef></hlm-th>
        <hlm-td *brnCellDef="let row">
          <button
            hlmBtn
            variant="ghost"
            class="h-7 w-7 p-0"
            align="end"
            [brnMenuTriggerFor]="menu"
          >
            <hlm-icon class="w-5 h-5" name="tablerDots" />
          </button>

          <ng-template #menu>
            <hlm-menu>
              <hlm-menu-group>
                <button hlmMenuItem (click)="copyOrgId(row)">
                  Copy org ID
                </button>
                <button hlmMenuItem (click)="copyUserId(row)">
                  Copy user ID
                </button>
              </hlm-menu-group>
              <hlm-menu-separator />
              <hlm-menu-group>
                <button hlmMenuItem>View posts</button>
                <button hlmMenuItem>View comments</button>
              </hlm-menu-group>
              <hlm-menu-separator />
              <hlm-menu-group>
                <button hlmMenuItem (click)="editUser(row)">Edit user</button>
                <button hlmMenuItem (click)="editOrg(row)">
                  Edit organization
                </button>
              </hlm-menu-group>
              <hlm-menu-separator />
              <button
                hlmMenuItem
                (click)="
                  deleteDialog.open({
                    action: 'Delete user',
                    onAction: onEntryDelete(row)
                  })
                "
              >
                Delete user (sync)
              </button>
              <button hlmMenuItem (click)="deleteLocalRow(row)">
                Delete user (local)
              </button>
            </hlm-menu>
          </ng-template>
        </hlm-td>
      </brn-column-def>
      <div
        class="flex items-center justify-center p-20 text-muted-foreground"
        brnNoDataRow
      >
        No data
      </div>
    </brn-table>
    <div
      class="flex flex-col justify-between mt-4 sm:flex-row sm:items-center"
      *brnPaginator="
        let ctx;
        totalElements: total();
        pageSize: pageSize();
        onStateChange: didPaginatorChange
      "
    >
      <span class="text-sm text-muted-foreground">
        {{ selectedEntries().length }} of {{ entries().length }} row(s) selected
      </span>
      <div class="flex mt-2 sm:mt-0">
        <brn-select
          class="inline-block"
          placeholder="{{ pageSizes[0] }}"
          [(ngModel)]="pageSize"
        >
          <hlm-select-trigger class="inline-flex mr-1 w-15 h-9">
            <hlm-select-value />
          </hlm-select-trigger>
          <hlm-select-content>
            @for (size of pageSizes; track size) {
            <hlm-option [value]="size">
              {{ size === 10000 ? 'All' : size }}
            </hlm-option>
            }
          </hlm-select-content>
        </brn-select>

        <div class="flex space-x-1">
          <button
            size="sm"
            variant="outline"
            hlmBtn
            [disabled]="!ctx.decrementable()"
            (click)="ctx.decrement()"
          >
            Previous
          </button>
          <button
            size="sm"
            variant="outline"
            hlmBtn
            (click)="ctx.increment()"
            [disabled]="!ctx.incrementable()"
          >
            Next
          </button>
        </div>
      </div>
    </div>

    <hlm-toaster [theme]="'dark'" />
    <delete-dialog #deleteDialog></delete-dialog>
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
export class UsersTableComponent {
  insta = insta;
  pageSizes = [5, 10, 20, 10000];
  pageSize = signal(this.pageSizes[0]);
  search = signal('');
  skip = signal(0);
  reload = signal(false);

  query = computed(() => {
    return {
      users: {
        $skip: this.skip(),
        $limit: this.pageSize(),
        $sort: this.sort(),
        $or: [
          { name: { $regex: this.search(), $options: 'i' } },
          { email: { $regex: this.search(), $options: 'i' } },
        ],
      },
    };
  });

  entryDialog = viewChild(UsersDialogComponent);
  lastEntries = signal<User[]>([]);

  entries$ = from(liveQuery(() => insta.query(this.query())))
    .pipe(tap(() => this.reload.set(true))) // to trigger angular change detection
    .subscribe();
  orgs$ = from(liveQuery(() => insta.query({ orgs: {} })))
    .pipe(tap(() => this.reload.set(true))) // to trigger angular change detection
    .subscribe();

  entries = derivedAsync(
    async () => {
      this.reload(); // to trigger angular change detection
      const { users } = await insta.query(this.query());

      // for each user, get the org
      for (const user of users) {
        const org = await insta
          .query({
            orgs: {
              $limit: 1,
              $filter: {
                _id: { $eq: ejectPointerId(user._p_org) },
              },
            },
          })
          .then(({ orgs }) => orgs[0]);

        user.org = org;
      }

      // update current selected user
      if (this.showUsersDialogEntry()) {
        const index = users.findIndex(
          (user) => user._id === this.showUsersDialogEntry()?._id
        );
        const lastIndex = this.lastEntries().findIndex(
          (user) => user._id === this.showUsersDialogEntry()?._id
        );
        if (index !== -1) {
          // calc what changed
          const lastUser = this.lastEntries()[lastIndex];
          const updatedFields = Object.keys(users[index]).reduce((acc, key) => {
            // @ts-ignore
            if (users[index][key] !== lastUser[key]) {
              // @ts-ignore
              acc[key] = users[index][key];
            }
            return acc;
          }, {} as Record<string, any>);

          const currentFormState = this.entryDialog()?.form.getRawValue() || {};

          const mergedUser = {
            ...(currentFormState ? currentFormState : users[index]),
            ...updatedFields,
          };

          this.showUsersDialogEntry.set(mergedUser as User);
        }
      }

      this.reload.set(false);
      this.lastEntries.set(users);
      return users;
    },
    {
      initialValue: [],
    }
  );

  total = derivedAsync(
    async () => {
      this.reload(); // to trigger angular change detection
      const count = await insta.count('users', {});
      this.reload.set(false);
      return count;
    },
    {
      initialValue: 0,
    }
  );

  columnsDisplayed = computed(() => [
    'select',
    ...this.columnManager.displayedColumns(),
    'actions',
  ]);

  lastSortedFields = signal(['_updated_at']);

  selectionModel = new SelectionModel<User>(true);

  selectedEntries = toSignal(
    this.selectionModel.changed.pipe(map((change) => change.source.selected)),
    {
      initialValue: [],
    }
  );
  selectedEntriesPaginated = computed(() =>
    this.entries().every((entry) => this.selectedEntries().includes(entry))
  );

  columnManager = useBrnColumnManager({
    status: { visible: true, label: 'Status' },
    name: { visible: true, label: 'Name' },
    email: { visible: true, label: 'Email' },
    updated: { visible: true, label: 'Updated' },
  });

  checkboxState = computed(() => {
    const noneSelected = this.selectedEntries().length === 0;
    const allSelectedOrIndeterminate = this.selectedEntriesPaginated()
      ? true
      : 'indeterminate';
    return noneSelected ? false : allSelectedOrIndeterminate;
  });

  didPaginatorChange = ({ startIndex, endIndex }: PaginatorState) => {
    this.skip.set(startIndex);
    this.selectionModel.clear();
  };

  toggleEntrySelection(entry: User) {
    this.selectionModel.toggle(entry);
  }

  toggleEntriesSelection() {
    const previousCbState = this.checkboxState();
    if (previousCbState === 'indeterminate' || !previousCbState) {
      this.selectionModel.select(...this.entries());
    } else {
      this.selectionModel.deselect(...this.entries());
    }
  }

  trackByEntry: TrackByFunction<User> = (_: number, p: User) => p._id;
  isEntrySelected = (entry: User) => this.selectionModel.isSelected(entry);

  /**
   * custom implementation below
   */
  readonly showUsersDialog = signal(false);
  readonly showUsersDialogEntry = signal<User>({} as User);
  readonly showOrgsDialog = signal(false);
  readonly showOrgsDialogEntry = signal<Org>({} as Org);

  readonly sortEmail = signal<'ASC' | 'DESC' | null>(null);
  readonly sortName = signal<'ASC' | 'DESC' | null>(null);
  readonly sortUpdatedAt = signal<'ASC' | 'DESC' | null>('DESC');

  protected sort = computed(() => {
    const order: Record<string, number> = {};

    for (const field of this.lastSortedFields()) {
      if (field === '_updated_at') {
        order['_updated_at'] = this.sortUpdatedAt() === 'ASC' ? 1 : -1;
      }

      if (field === 'name') {
        order['name'] = this.sortName() === 'ASC' ? 1 : -1;
      }

      if (field === 'email') {
        order['email'] = this.sortEmail() === 'ASC' ? 1 : -1;
      }
    }

    return order;
  });

  protected handleEmailSortChange() {
    this.lastSortedFields.set([
      ...new Set(['email', ...this.lastSortedFields()]),
    ]);
    const sort = this.sortEmail();
    if (sort === 'ASC') {
      this.sortEmail.set('DESC');
    } else if (sort === 'DESC') {
      this.sortEmail.set(null);
    } else {
      this.sortEmail.set('ASC');
    }
  }

  protected handleNameSortChange() {
    this.lastSortedFields.set([
      ...new Set(['name', ...this.lastSortedFields()]),
    ]);
    const sort = this.sortName();
    if (sort === 'ASC') {
      this.sortName.set('DESC');
    } else if (sort === 'DESC') {
      this.sortName.set(null);
    } else {
      this.sortName.set('ASC');
    }
  }

  protected handleUpdatedSortChange() {
    this.lastSortedFields.set([
      ...new Set(['_updated_at', ...this.lastSortedFields()]),
    ]);
    const sort = this.sortUpdatedAt();
    if (sort === 'ASC') {
      this.sortUpdatedAt.set('DESC');
    } else if (sort === 'DESC') {
      this.sortUpdatedAt.set(null);
    } else {
      this.sortUpdatedAt.set('ASC');
    }
  }

  protected onEntryDelete(entry: User) {
    return async () => {
      this.selectionModel.deselect(entry);
      await insta.mutate('users').delete(entry._id);
    };
  }

  protected editUser(entry: User) {
    this.showUsersDialogEntry.set(entry);
    this.showUsersDialog.set(true);
  }

  protected editOrg(entry: User) {
    this.showOrgsDialogEntry.set(entry.org as Org);
    this.showOrgsDialog.set(true);
  }

  protected copyOrgId(entry: User) {
    navigator.clipboard.writeText(entry.org?._id || '');
    toast('Org ID copied to clipboard', {
      description: `ID: ${entry.org?._id || ''}`,
      action: {
        label: 'Nice',
        onClick: () => console.log(`📎 Org: ${entry.org?._id || ''}`),
      },
    });
  }

  protected copyUserId(entry: User) {
    navigator.clipboard.writeText(entry._id);
    toast('User ID copied to clipboard', {
      description: `ID: ${entry._id}`,
      action: {
        label: 'Gotcha',
        onClick: () => console.log(`📎 User: ${entry._id}`),
      },
    });
  }

  async deleteLocalRow(entry: User) {
    await insta.db.table('users').delete(entry._id);
  }
}
