import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  standalone: true,
  selector: 'app-home-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: ``,
  template: `
    <h1>borda.js</h1>
    <p>Welcome to the angular app example.</p>
    <ul>
      <li>
        <a routerLink="/overview">Overview</a>
      </li>
      <li>
        <a routerLink="/offline">Offline first</a>
      </li>
    </ul>
  `,
})
export class HomePageComponent {}
