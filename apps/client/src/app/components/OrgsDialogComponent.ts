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

import { Org } from '@/common';
import {
  lucideCheck,
  lucideChevronsUpDown,
  lucideSearch,
} from '@ng-icons/lucide';
import { HlmButtonDirective } from '@spartan-ng/ui-button-helm';
import {
  BrnDialogComponent,
  BrnDialogContentDirective,
} from '@spartan-ng/ui-dialog-brain';
import {
  HlmDialogComponent,
  HlmDialogContentComponent,
  HlmDialogDescriptionDirective,
  HlmDialogFooterComponent,
  HlmDialogHeaderComponent,
  HlmDialogTitleDirective,
} from '@spartan-ng/ui-dialog-helm';
import { provideIcons } from '@spartan-ng/ui-icon-helm';
import { HlmInputDirective } from '@spartan-ng/ui-input-helm';
import { HlmLabelDirective } from '@spartan-ng/ui-label-helm';

import { insta } from '../borda';

@Component({
  standalone: true,
  selector: 'orgs-dialog',
  imports: [
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
    <form [formGroup]="form" (ngSubmit)="submit()">
      <hlm-dialog
        [state]="dialogState()"
        (stateChanged)="$event === 'closed' ? onClose.emit() : onOpen.emit()"
      >
        <hlm-dialog-content
          #dialogContent
          class="sm:max-w-[425px] sm:min-w-[425px] px-7 pt-10 pb-7 rounded-xl"
          *brnDialogContent="let ctx"
        >
          <hlm-dialog-header>
            <h3 hlmDialogTitle>Create Organization</h3>
            <!-- <p hlmDialogDescription class="mt-2">Create a new organization</p> -->
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
export class OrgsDialogComponent {
  dialog = viewChild(BrnDialogComponent);
  orgs = signal<Org[]>([]);
  open = input.required<boolean>();
  onClose = output<void>();
  onOpen = output<void>();

  dialogState = computed(() => {
    return this.open() ? 'open' : 'closed';
  });

  currentOrg = signal<Org | undefined>(undefined);

  entry = input<Org>({} as Org);

  form = new FormGroup({
    id: new FormControl('', []),
    name: new FormControl('', [Validators.required]),
  });

  ngOnChanges() {
    const formValue = this.form.getRawValue();
    if (!formValue.id) {
      this.form.patchValue({
        id: this.entry()._id,
        name: this.entry().name,
      });
    } else {
      this.form.patchValue({
        name: this.entry().name,
      });
    }
    this.form.updateValueAndValidity();
  }

  async submit() {
    try {
      if (this.form.value.id) {
        await insta.mutate('orgs').update(this.form.value.id as string, {
          name: this.form.value.name as string,
        });
      } else {
        await insta.mutate('orgs').add({
          name: this.form.value.name as string,
        });
      }
      this.form.reset();
      this.dialog()?.close({});
    } catch (err) {
      console.error(err);
    }
  }
}
