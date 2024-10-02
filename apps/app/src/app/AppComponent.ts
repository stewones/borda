import { toast } from 'ngx-sonner';
import { filter } from 'rxjs';

import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
} from '@angular/core';
import { RouterModule } from '@angular/router';

import { HlmToasterComponent } from '@spartan-ng/ui-sonner-helm';

import { insta } from './borda';

@Component({
  standalone: true,
  selector: 'insta-app',
  imports: [RouterModule, HlmToasterComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  styles: `
    form {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    input {
      padding: 0.25rem;
    }

    button {
      padding: 0.45rem;
    }

    table {
      width: 100%;
    }
  `,
  template: `
    <router-outlet></router-outlet>
    <hlm-toaster [theme]="'dark'" />
  `,
})
export class AppComponent {
  errors$ = insta.errors
    .pipe(
      filter((err) =>
        ['validation_error', 'bad_request', 'internal_server_error'].includes(
          err.type ?? ''
        )
      )
    )
    .subscribe((err) => {
      const { message, summary, errors } = err;
      const niceMessage = errors
        ?.map((e) => `- ${e.path}: ${e.message}`)
        .join('<br />');

      toast(message, {
        description: `${summary}<br />${niceMessage}`,
        duration: 8000,
      });

      setTimeout(() => {
        // on next tick parse <br /> which is string to actual line break
        const toasts = document.querySelectorAll(
          'ngx-sonner-toaster li[data-sonner-toast]'
        );
        toasts.forEach((toast) => {
          const description = toast.querySelector('[data-description]');
          if (description && description instanceof HTMLElement) {
            const content = description.textContent || '';
            const fragment = document.createDocumentFragment();

            content.split('<br />').forEach((text, index, array) => {
              fragment.appendChild(document.createTextNode(text));
              if (index < array.length - 1) {
                fragment.appendChild(document.createElement('br'));
              }
            });

            description.innerHTML = '';
            description.appendChild(fragment);
          }
        });
      }, 0);
    });
  async ngOnInit() {
    const usage = await insta.usage();
    console.log(`💽 total indexeddb usage`, usage);
    /**
     * starts the sync process
     */
    // insta.sync({
    //   session: 'the-token',
    //   user: 'the-user-id',
    //   params: {
    //     // org: 'YwkJYEdhgh,HnPHIL7PKx,r24qXJr9nh,LNcx7jlL7P',
    //     // something: 'else',
    //   },
    // });
  }
}
