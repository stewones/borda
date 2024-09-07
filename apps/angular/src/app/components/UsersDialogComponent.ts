import { NgForOf } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import {
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

import { Org, orgPointer } from '@/common';
import {
  lucideCheck,
  lucideChevronsUpDown,
  lucideSearch,
} from '@ng-icons/lucide';
import { HlmButtonDirective } from '@spartan-ng/ui-button-helm';
import { BrnCommandImports } from '@spartan-ng/ui-command-brain';
import { HlmCommandImports } from '@spartan-ng/ui-command-helm';
import {
  BrnDialogComponent,
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
import { OrgSelectComponent } from './OrgSelectComponent';

@Component({
  standalone: true,
  selector: 'users-dialog',
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
    OrgSelectComponent,
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
    <form [formGroup]="form" (ngSubmit)="submit()">
      <hlm-dialog
        [state]="dialogState()"
        (stateChanged)="$event === 'closed' ? onClose.emit() : onOpen.emit()"
      >
        <hlm-dialog-content
          #dialogContent
          class="sm:max-w-[425px] px-7 pt-10 pb-7 rounded-xl"
          *brnDialogContent="let ctx"
        >
          <hlm-dialog-header>
            <h3 hlmDialogTitle>Create User</h3>
            <p hlmDialogDescription class="mt-2">
              Create a new user with the following details:
            </p>
          </hlm-dialog-header>
          <div class="py-4 grid gap-4">
            <div class="items-center grid grid-cols-4 gap-4">
              <label hlmLabel for="name" class="text-right">Name</label>
              <input
                hlmInput
                id="name"
                formControlName="name"
                class="col-span-3"
              />
            </div>
            <div class="items-center grid grid-cols-4 gap-4">
              <label hlmLabel for="email" class="text-right">Email</label>
              <input
                hlmInput
                id="email"
                formControlName="email"
                class="col-span-3"
              />
            </div>
            <div class="items-center grid grid-cols-4 gap-4">
              <label hlmLabel for="organization" class="text-right">
                Organization
              </label>
              <org-select
                [org]="currentOrg()"
                (onSelect)="selectOrg($event)"
              ></org-select>
            </div>
          </div>
          <hlm-dialog-footer class="flex gap-2">
            <button
              hlmBtn
              type="submit"
              [disabled]="form.invalid"
              (click)="submit()"
            >
              Save changes
            </button>
            <button hlmBtn type="button" variant="ghost" (click)="ctx.close()">
              Cancel
            </button>
          </hlm-dialog-footer>
        </hlm-dialog-content>
      </hlm-dialog>
    </form>
  `,
})
export class UsersDialogComponent {
  dialog = viewChild(BrnDialogComponent);
  open = input.required<boolean>();
  onClose = output<void>();
  onOpen = output<void>();

  dialogState = computed(() => {
    return this.open() ? 'open' : 'closed';
  });

  currentOrg = signal<Org | undefined>(undefined);

  form = new FormGroup({
    name: new FormControl('', [Validators.required]),
    email: new FormControl('', [Validators.required, Validators.email]),
    orgId: new FormControl('', [Validators.required]),
  });

  async submit() {
    try {
      await insta.mutate('users').add({
        name: this.form.value.name as string,
        email: this.form.value.email as string,
        _p_org: orgPointer(this.form.value.orgId as string),
      });
      this.form.reset();
      this.dialog()?.close({});
    } catch (err) {
      console.error(err);
    }
  }

  selectOrg(org: Org) {
    this.currentOrg.set(org);
    this.form.patchValue({ orgId: org._id });
  }
}
