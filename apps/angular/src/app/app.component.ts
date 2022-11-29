import { Component } from '@angular/core';
import { parseQuery } from '@elegante/sdk';

@Component({
  standalone: true,
  imports: [],
  selector: 'elegante-root',
  template: `coming soon`,
  styles: [],
})
export class AppComponent {
  constructor() {
    console.log(
      parseQuery({
        _created_at: {
          $gt: '2022-11-28T11:58:37.051Z',
        },
      })
    );
  }
}
