import { liveQuery } from 'dexie';
import { derivedAsync } from 'ngxtension/derived-async';
import { from, tap } from 'rxjs';

import { NgForOf } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import {
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

import { Org } from '@/common';
import {
  lucideCheck,
  lucideChevronsUpDown,
  lucideSearch,
} from '@ng-icons/lucide';
import { HlmButtonDirective } from '@spartan-ng/ui-button-helm';
import { BrnCommandImports } from '@spartan-ng/ui-command-brain';
import { HlmCommandImports } from '@spartan-ng/ui-command-helm';
import {
  BrnDialogContentDirective,
  BrnDialogTriggerDirective,
} from '@spartan-ng/ui-dialog-brain';
import {
  HlmDialogComponent,
  HlmDialogContentComponent,
  HlmDialogDescriptionDirective,
  HlmDialogFooterComponent,
  HlmDialogHeaderComponent,
  HlmDialogTitleDirective,
} from '@spartan-ng/ui-dialog-helm';
import { HlmIconComponent, provideIcons } from '@spartan-ng/ui-icon-helm';
import { HlmInputDirective } from '@spartan-ng/ui-input-helm';
import { HlmLabelDirective } from '@spartan-ng/ui-label-helm';
import {
  BrnPopoverComponent,
  BrnPopoverContentDirective,
  BrnPopoverTriggerDirective,
} from '@spartan-ng/ui-popover-brain';
import { HlmPopoverContentDirective } from '@spartan-ng/ui-popover-helm';

import { insta } from '../borda';

@Component({
  standalone: true,
  selector: 'org-select',
  imports: [
    BrnDialogTriggerDirective,
    BrnDialogContentDirective,
    HlmDialogComponent,
    HlmDialogContentComponent,
    HlmDialogHeaderComponent,
    HlmDialogFooterComponent,
    HlmDialogTitleDirective,
    HlmDialogDescriptionDirective,
    HlmLabelDirective,
    HlmInputDirective,
    HlmButtonDirective,
    BrnCommandImports,
    HlmCommandImports,
    HlmIconComponent,
    BrnPopoverComponent,
    BrnPopoverTriggerDirective,
    HlmPopoverContentDirective,
    BrnPopoverContentDirective,
    NgForOf,
    FormsModule,
    ReactiveFormsModule,
  ],
  providers: [
    provideIcons({ lucideChevronsUpDown, lucideSearch, lucideCheck }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  styles: `
  button[brndialogclose] {
  @apply absolute right-2 top-2 text-muted-foreground;
  }
  `,
  template: `
    <brn-popover
      [state]="selectedOrgState()"
      (stateChanged)="selectedOrgStateChanged($event)"
      sideOffset="5"
      closeDelay="100"
    >
      <button
        class="w-[200px] justify-between text-left"
        id="edit-profile"
        variant="outline"
        brnPopoverTrigger
        hlmBtn
      >
        <span class="truncate w-full max-w-[calc(100%-18px)]">
          {{ currentOrg() ? currentOrg()?.name : 'Select organization' }}
        </span>
        <hlm-icon size="xs" name="lucideChevronsUpDown" />
      </button>
      <brn-cmd
        *brnPopoverContent="let ctx"
        hlmPopoverContent
        hlm
        class="p-0 w-[200px]"
      >
        <hlm-cmd-input-wrapper>
          <hlm-icon name="lucideSearch" size="sm" />
          <input
            placeholder="Search by name"
            brnCmdInput
            hlm
            class="px-2"
            (input)="didSearchOrg($event)"
          />
        </hlm-cmd-input-wrapper>
        @if(! orgs().length) {
        <!-- *brnCmdEmpty -->
        <div hlmCmdEmpty>No results found.</div>
        }
        <brn-cmd-list hlm>
          <!-- <brn-cmd-group hlm> -->
          @for (org of orgs(); track $index) {
          <button
            brnCmdItem
            [value]="org._id"
            (selected)="selectOrg(org)"
            hlm
            class="text-left"
          >
            <hlm-icon
              [class.opacity-0]="currentOrg()?._id !== org._id"
              name="lucideCheck"
              hlmCmdIcon
            />
            <span class="truncate w-[148px]">
              {{ org.name }}
            </span>
          </button>
          }
          <!-- </brn-cmd-group> -->
        </brn-cmd-list>
      </brn-cmd>
    </brn-popover>
  `,
})
export class OrgSelectComponent {
  onSelect = output<Org>();
  onOrgsLoad = output<Org[]>();

  reload = signal(false);

  query = computed(() => {
    return {
      orgs: {
        $limit: 10000,
        $filter: {
          name: {
            $regex: this.search(),
          },
        },
      },
    };
  });

  orgs = derivedAsync(
    async () => {
      this.reload();
      const { orgs } = await insta.query(this.query());
      this.reload.set(false);
      this.onOrgsLoad.emit(orgs);
      return orgs;
    },
    {
      initialValue: [],
    }
  );

  orgs$ = from(liveQuery(() => insta.query(this.query())))
    .pipe(tap(() => this.reload.set(true))) // to trigger angular change detection
    .subscribe();

  search = signal('');

  org = input<Org | undefined>(undefined);

  currentOrg = signal<Org | undefined>(this.org());

  selectedOrgState = signal<'closed' | 'open'>('closed');

  form = new FormGroup({
    name: new FormControl('', [Validators.required]),
    email: new FormControl('', [Validators.required, Validators.email]),
    orgId: new FormControl('', [Validators.required]),
  });

  ngOnChanges() {
    this.currentOrg.set(this.org());
  }

  selectedOrgStateChanged(state: 'open' | 'closed') {
    this.selectedOrgState.set(state);
  }

  selectOrg(org: Org) {
    this.onSelect.emit(org);
    this.selectedOrgState.set('closed');
    if (this.currentOrg()?._id === org._id) {
      this.currentOrg.set(undefined);
    } else {
      this.currentOrg.set(org);
    }
  }

  didSearchOrg($event: Event) {
    this.search.set(($event.target as HTMLInputElement).value);
  }
}
