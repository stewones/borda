import { liveQuery } from 'dexie';
import { DateFnsModule } from 'ngx-date-fns';
import { derivedAsync } from 'ngxtension/derived-async';
import { from, map, tap } from 'rxjs';
import { z } from 'zod';

import { SelectionModel } from '@angular/cdk/collections';
import { DecimalPipe, TitleCasePipe } from '@angular/common';
import { Component, computed, signal, TrackByFunction } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';

import { UserSchema } from '@/support';
import {
  lucideArrowDown,
  lucideArrowUp,
  lucideArrowUpDown,
  lucideChevronDown,
} from '@ng-icons/lucide';
import { tablerDots } from '@ng-icons/tabler-icons';
import { HlmButtonModule } from '@spartan-ng/ui-button-helm';
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
import {
  BrnTableModule,
  PaginatorState,
  useBrnColumnManager,
} from '@spartan-ng/ui-table-brain';
import { HlmTableModule } from '@spartan-ng/ui-table-helm';

import { insta } from '../borda';

@Component({
  standalone: true,
  selector: 'users-table',
  imports: [
    FormsModule,
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
    BrnSelectModule,
    HlmSelectModule,
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
  template: `
    <div class="flex flex-col justify-between gap-4 sm:flex-row">
      <input
        hlmInput
        class="w-full md:w-80"
        placeholder="Filter by name and email"
        [(ngModel)]="search"
      />

      <button hlmBtn variant="outline" align="end" [brnMenuTriggerFor]="menu">
        Columns
        <hlm-icon name="lucideChevronDown" class="ml-2" size="sm" />
      </button>
      <ng-template #menu>
        <hlm-menu class="w-32">
          @for (column of tableColumnManager.allColumns; track column.name) {
          <button
            hlmMenuItemCheckbox
            [disabled]="tableColumnManager.isColumnDisabled(column.name)"
            [checked]="tableColumnManager.isColumnVisible(column.name)"
            (triggered)="tableColumnManager.toggleVisibility(column.name)"
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
      class="border-border mt-4 block overflow-auto rounded-md border"
      [dataSource]="users()"
      [displayedColumns]="_allDisplayedColumns()"
      [trackBy]="_trackBy"
    >
      <brn-column-def name="select" class="w-12">
        <hlm-th *brnHeaderDef>
          <hlm-checkbox
            [checked]="_checkboxState()"
            (changed)="handleHeaderCheckboxChange()"
          />
        </hlm-th>
        <hlm-td *brnCellDef="let element">
          <hlm-checkbox
            [checked]="_isPaymentSelected(element)"
            (changed)="togglePayment(element)"
          />
        </hlm-td>
      </brn-column-def>
      <brn-column-def name="status" class="w-24">
        <hlm-th *brnHeaderDef>
          <button
            hlmBtn
            size="sm"
            variant="ghost"
            (click)="handleStatusSortChange()"
            class="-ml-3"
          >
            Status
            <hlm-icon
              class="ml-3"
              size="xs"
              [name]="
                filteredStatusSort() === 'ASC'
                  ? 'lucideArrowUp'
                  : filteredStatusSort() === 'DESC'
                  ? 'lucideArrowDown'
                  : 'lucideArrowUpDown'
              "
            />
          </button>
        </hlm-th>

        <hlm-td truncate *brnCellDef="let row">
          {{ row._expires_at ? 'Deleted' : 'Active' }}
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
                filteredNameSort() === 'ASC'
                  ? 'lucideArrowUp'
                  : filteredNameSort() === 'DESC'
                  ? 'lucideArrowDown'
                  : 'lucideArrowUpDown'
              "
            />
          </button>
        </hlm-th>

        <hlm-td truncate *brnCellDef="let row">
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
                filteredEmailSort() === 'ASC'
                  ? 'lucideArrowUp'
                  : filteredEmailSort() === 'DESC'
                  ? 'lucideArrowDown'
                  : 'lucideArrowUpDown'
              "
            />
          </button>
        </hlm-th>
        <hlm-td truncate *brnCellDef="let element">
          {{ element.email }}
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
                filteredUpdatedSort() === 'ASC'
                  ? 'lucideArrowUp'
                  : filteredUpdatedSort() === 'DESC'
                  ? 'lucideArrowDown'
                  : 'lucideArrowUpDown'
              "
            />
          </button>
        </hlm-th>
        <hlm-td class="font-normal whitespace-nowrap" *brnCellDef="let row">
          {{ row._updated_at | dfnsParseIso | dfnsFormat : 'MMM d, HH:mm' }}
        </hlm-td>
      </brn-column-def>
      <brn-column-def name="actions" class="w-16">
        <hlm-th *brnHeaderDef></hlm-th>
        <hlm-td *brnCellDef="let element">
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
              <hlm-menu-label>Actions</hlm-menu-label>
              <hlm-menu-separator />
              <hlm-menu-group>
                <button hlmMenuItem>Copy payment ID</button>
              </hlm-menu-group>
              <hlm-menu-separator />
              <hlm-menu-group>
                <button hlmMenuItem>View customer</button>
                <button hlmMenuItem>View payment details</button>
              </hlm-menu-group>
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
        pageSize: _pageSize();
        onStateChange: _onStateChange
      "
    >
      <span class="text-sm text-muted-foreground text-sm"
        >{{ _selected().length }} of {{ _totalElements() }} row(s)
        selected</span
      >
      <div class="flex mt-2 sm:mt-0">
        <brn-select
          class="inline-block"
          placeholder="{{ _availablePageSizes[0] }}"
          [(ngModel)]="_pageSize"
        >
          <hlm-select-trigger class="inline-flex mr-1 w-15 h-9">
            <hlm-select-value />
          </hlm-select-trigger>
          <hlm-select-content>
            @for (size of _availablePageSizes; track size) {
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
  `,
})
export class UsersTableComponent {
  protected readonly search = signal('');
  protected readonly _availablePageSizes = [5, 10, 20, 10000];
  protected readonly _pageSize = signal(this._availablePageSizes[0]);

  private readonly _selectionModel = new SelectionModel<
    z.infer<typeof UserSchema>
  >(true);
  protected readonly _isPaymentSelected = (
    payment: z.infer<typeof UserSchema>
  ) => this._selectionModel.isSelected(payment);

  protected readonly _selected = toSignal(
    this._selectionModel.changed.pipe(map((change) => change.source.selected)),
    {
      initialValue: [],
    }
  );

  protected readonly tableColumnManager = useBrnColumnManager({
    status: { visible: true, label: 'Status' },
    name: { visible: true, label: 'Name' },
    email: { visible: true, label: 'Email' },
    updated: { visible: true, label: 'Updated' },
  });
  protected readonly _allDisplayedColumns = computed(() => [
    'select',
    ...this.tableColumnManager.displayedColumns(),
    'actions',
  ]);

  lastSortedFields = signal(['_updated_at']);
  skip = signal(0);

  sort = computed(() => {
    const sort: Record<string, number> = {};

    for (const field of this.lastSortedFields()) {
      if (field === '_updated_at') {
        sort['_updated_at'] = this.filteredUpdatedSort() === 'ASC' ? 1 : -1;
      }

      if (field === 'name') {
        sort['name'] = this.filteredNameSort() === 'ASC' ? 1 : -1;
      }

      if (field === 'email') {
        sort['email'] = this.filteredEmailSort() === 'ASC' ? 1 : -1;
      }
    }

    return sort;
  });

  reload = signal(false);

  query = computed(() => {
    return {
      users: {
        $skip: this.skip(),
        $limit: this._pageSize(),
        $sort: this.sort(),
        $or: [
          { name: { $regex: this.search(), $options: 'i' } },
          { email: { $regex: this.search(), $options: 'i' } },
        ],
      },
    };
  });

  total = derivedAsync(
    async () => {
      this.reload(); // to trigger angular change detection
      const total = await insta.count('users', {});
      this.reload.set(false);
      return total;
    },
    {
      initialValue: 0,
    }
  );

  users = derivedAsync(
    async () => {
      this.reload(); // to trigger angular change detection
      const { users } = await insta.query(this.query());
      this.reload.set(false);
      return users;
    },
    {
      initialValue: [],
    }
  );

  users$ = from(liveQuery(() => insta.query(this.query())))
    .pipe(tap(() => this.reload.set(true))) // to trigger angular change detection
    .subscribe();

  readonly filteredEmailSort = signal<'ASC' | 'DESC' | null>(null);
  readonly filteredNameSort = signal<'ASC' | 'DESC' | null>(null);
  readonly filteredUpdatedSort = signal<'ASC' | 'DESC' | null>('DESC');
  readonly filteredStatusSort = signal<'ASC' | 'DESC' | null>(null);

  protected readonly _allFilteredPaginatedPaymentsSelected = computed(() =>
    this.users().every((user) => this._selected().includes(user))
  );

  protected readonly _checkboxState = computed(() => {
    const noneSelected = this._selected().length === 0;
    const allSelectedOrIndeterminate =
      this._allFilteredPaginatedPaymentsSelected() ? true : 'indeterminate';
    return noneSelected ? false : allSelectedOrIndeterminate;
  });

  protected readonly _trackBy: TrackByFunction<z.infer<typeof UserSchema>> = (
    _: number,
    p: z.infer<typeof UserSchema>
  ) => p._id;

  protected readonly _totalElements = computed(() => this.users().length);

  protected readonly _onStateChange = ({
    startIndex,
    endIndex,
  }: PaginatorState) => {
    this.skip.set(startIndex);
    this._selectionModel.clear();
  };

  protected togglePayment(payment: z.infer<typeof UserSchema>) {
    this._selectionModel.toggle(payment);
  }

  protected handleHeaderCheckboxChange() {
    const previousCbState = this._checkboxState();
    if (previousCbState === 'indeterminate' || !previousCbState) {
      this._selectionModel.select(...this.users());
    } else {
      this._selectionModel.deselect(...this.users());
    }
  }

  protected handleEmailSortChange() {
    this.lastSortedFields.set([
      ...new Set(['email', ...this.lastSortedFields()]),
    ]);
    const sort = this.filteredEmailSort();
    if (sort === 'ASC') {
      this.filteredEmailSort.set('DESC');
    } else if (sort === 'DESC') {
      this.filteredEmailSort.set(null);
    } else {
      this.filteredEmailSort.set('ASC');
    }
  }

  protected handleNameSortChange() {
    this.lastSortedFields.set([
      ...new Set(['name', ...this.lastSortedFields()]),
    ]);
    const sort = this.filteredNameSort();
    if (sort === 'ASC') {
      this.filteredNameSort.set('DESC');
    } else if (sort === 'DESC') {
      this.filteredNameSort.set(null);
    } else {
      this.filteredNameSort.set('ASC');
    }
  }

  protected handleUpdatedSortChange() {
    this.lastSortedFields.set([
      ...new Set(['_updated_at', ...this.lastSortedFields()]),
    ]);
    const sort = this.filteredUpdatedSort();
    if (sort === 'ASC') {
      this.filteredUpdatedSort.set('DESC');
    } else if (sort === 'DESC') {
      this.filteredUpdatedSort.set(null);
    } else {
      this.filteredUpdatedSort.set('ASC');
    }
  }

  protected handleStatusSortChange() {
    this.lastSortedFields.set([
      ...new Set(['_expires_at', ...this.lastSortedFields()]),
    ]);
    const sort = this.filteredStatusSort();
    if (sort === 'ASC') {
      this.filteredStatusSort.set('DESC');
    } else if (sort === 'DESC') {
      this.filteredStatusSort.set(null);
    } else {
      this.filteredStatusSort.set('ASC');
    }
  }
}
