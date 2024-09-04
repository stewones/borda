import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
} from '@angular/core';
import { RouterModule } from '@angular/router';

import { insta } from './borda';

@Component({
  standalone: true,
  selector: 'borda-app',
  imports: [RouterModule],
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
  template: `<router-outlet></router-outlet>`,
})
export class AppComponent {
  async ngOnInit() {
    const usage = await insta.usage();
    console.log(`💽 total indexeddb usage`, usage);
    /**
     * starts the sync process
     */
    insta.sync({
      session: 'asdf',
      params: {
        org: 'YwkJYEdhgh',
      },
    });
  }
}
