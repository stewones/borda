import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

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
export class OfflinePageComponent {}
