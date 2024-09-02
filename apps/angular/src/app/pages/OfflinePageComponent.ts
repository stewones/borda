import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { insta } from '../borda';

@Component({
  standalone: true,
  selector: 'app-offline-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: ``,
  template: `
    <h1>Offline first</h1>
    <p></p>
    asdf
  `,
})
export class OfflinePageComponent {
  async ngOnInit() {
    /**
     * starts the sync process
     */
    insta.sync();
  }
}
