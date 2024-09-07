import { Component } from '@angular/core';

@Component({
  standalone: true,
  selector: 'pulsing-dot',
  host: {
    class: 'relative flex h-3 w-3',
  },
  template: `
    <span
      class="animate-ping absolute inline-flex h-full w-full rounded-full bg-lime-400 opacity-75"
    ></span>
    <span class="relative inline-flex rounded-full h-3 w-3 bg-lime-500"></span>
  `,
})
export class PulsingDot {}
