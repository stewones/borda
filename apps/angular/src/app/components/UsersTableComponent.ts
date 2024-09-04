import { derivedAsync } from 'ngxtension/derived-async';
import { debounceTime, map } from 'rxjs';
import { z } from 'zod';

import { SelectionModel } from '@angular/cdk/collections';
import { DecimalPipe, TitleCasePipe } from '@angular/common';
import {
  Component,
  computed,
  effect,
  signal,
  TrackByFunction,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

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

export type Payment = {
  id: string;
  amount: number;
  status: 'pending' | 'processing' | 'success' | 'failed';
  email: string;
};

@Component({
  standalone: true,
  selector: 'users-table',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    BrnMenuTriggerDirective,
    HlmMenuModule,
    BrnTableModule,
    HlmTableModule,
    HlmButtonModule,
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
  host: {
    class: 'w-full',
  },
  template: `
    <div class="flex flex-col justify-between gap-4 sm:flex-row">
      <input
        hlmInput
        class="w-full md:w-80"
        placeholder="Filter emails..."
        [ngModel]="filteredEmail()"
        (ngModelChange)="_rawFilterInput.set($event)"
      />

      <button hlmBtn variant="outline" align="end" [brnMenuTriggerFor]="menu">
        Columns
        <hlm-icon name="lucideChevronDown" class="ml-2" size="sm" />
      </button>
      <ng-template #menu>
        <hlm-menu class="w-32">
          @for (column of _brnColumnManager.allColumns; track column.name) {
          <button
            hlmMenuItemCheckbox
            [disabled]="_brnColumnManager.isColumnDisabled(column.name)"
            [checked]="_brnColumnManager.isColumnVisible(column.name)"
            (triggered)="_brnColumnManager.toggleVisibility(column.name)"
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
      [dataSource]="_filteredSortedPaginatedPayments()"
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
        <hlm-th truncate *brnHeaderDef>Status</hlm-th>
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
              size="sm"
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
              size="sm"
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
      <brn-column-def name="amount" class="justify-end w-20">
        <hlm-th *brnHeaderDef>Amount</hlm-th>
        <hlm-td class="font-medium tabular-nums" *brnCellDef="let element">
          $ {{ element.amount | number : '1.2-2' }}
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
        totalElements: _totalElements();
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
            [disabled]="!ctx.incrementable()"
            (click)="ctx.increment()"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  `,
})
export class UsersTableComponent {
  protected readonly _rawFilterInput = signal('');
  protected readonly filteredEmail = signal('');
  private readonly _debouncedFilter = toSignal(
    toObservable(this._rawFilterInput).pipe(debounceTime(300))
  );

  private readonly _displayedIndices = signal({ start: 0, end: 0 });
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

  protected readonly _brnColumnManager = useBrnColumnManager({
    status: { visible: true, label: 'Status' },
    name: { visible: true, label: 'Name' },
    email: { visible: true, label: 'Email' },
    amount: { visible: true, label: 'Amount ($)' },
  });
  protected readonly _allDisplayedColumns = computed(() => [
    'select',
    ...this._brnColumnManager.displayedColumns(),
    'actions',
  ]);

  private readonly users = derivedAsync(
    async () => {
      const { users } = await insta.query({ users: { $limit: 20 } });
      return users;
    },
    {
      initialValue: [],
    }
  );

  private readonly filteredUsers = computed(() => {
    const emailFilter = this.filteredEmail()?.trim()?.toLowerCase();
    if (emailFilter && emailFilter.length > 0) {
      return this.users().filter((u) =>
        u.email.toLowerCase().includes(emailFilter)
      );
    }
    return this.users();
  });

  readonly filteredEmailSort = signal<'ASC' | 'DESC' | null>(null);
  readonly filteredNameSort = signal<'ASC' | 'DESC' | null>(null);

  protected readonly _filteredSortedPaginatedPayments = computed(() => {
    const emailSort = this.filteredEmailSort();
    const nameSort = this.filteredNameSort();
    const start = this._displayedIndices().start;
    const end = this._displayedIndices().end + 1;
    const users = this.filteredUsers();

    if (!emailSort && !nameSort) {
      return users.slice(start, end);
    }

    return [...users]
      .sort((p1, p2) => {
        if (emailSort) {
          const emailComparison = p1.email.localeCompare(p2.email);
          return emailSort === 'ASC' ? emailComparison : -emailComparison;
        }
        if (nameSort) {
          const nameComparison = p1.name.localeCompare(p2.name);
          return nameSort === 'ASC' ? nameComparison : -nameComparison;
        }

        return 0;
      })
      .slice(start, end);
  });

  protected readonly _allFilteredPaginatedPaymentsSelected = computed(() =>
    this._filteredSortedPaginatedPayments().every((user) =>
      this._selected().includes(user)
    )
  );

  protected readonly _checkboxState = computed(() => {
    const noneSelected = this._selected().length === 0;
    const allSelectedOrIndeterminate =
      this._allFilteredPaginatedPaymentsSelected() ? true : 'indeterminate';
    return noneSelected ? false : allSelectedOrIndeterminate;
  });

  protected readonly _trackBy: TrackByFunction<Payment> = (
    _: number,
    p: Payment
  ) => p.id;
  protected readonly _totalElements = computed(
    () => this.filteredUsers().length
  );
  protected readonly _onStateChange = ({
    startIndex,
    endIndex,
  }: PaginatorState) =>
    this._displayedIndices.set({ start: startIndex, end: endIndex });

  constructor() {
    // needed to sync the debounced filter to the name filter, but being able to override the
    // filter when loading new users without debounce
    effect(() => this.filteredEmail.set(this._debouncedFilter() ?? ''), {
      allowSignalWrites: true,
    });
  }

  protected togglePayment(payment: z.infer<typeof UserSchema>) {
    this._selectionModel.toggle(payment);
  }

  protected handleHeaderCheckboxChange() {
    const previousCbState = this._checkboxState();
    if (previousCbState === 'indeterminate' || !previousCbState) {
      this._selectionModel.select(...this._filteredSortedPaginatedPayments());
    } else {
      this._selectionModel.deselect(...this._filteredSortedPaginatedPayments());
    }
  }

  protected handleEmailSortChange() {
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
    const sort = this.filteredNameSort();
    if (sort === 'ASC') {
      this.filteredNameSort.set('DESC');
    } else if (sort === 'DESC') {
      this.filteredNameSort.set(null);
    } else {
      this.filteredNameSort.set('ASC');
    }
  }
}
