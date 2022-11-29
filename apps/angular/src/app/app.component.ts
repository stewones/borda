import { Component } from '@angular/core';
import { createClient, parseFilter, query } from '@elegante/sdk';

console.time('startup');

const client = createClient({
  apiKey: 'ELEGANTE_SERVER',
  serverURL: 'http://localhost:3135/server',
});

interface User {
  createdAt: string;
  name: string;
  email: string;
}

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
      parseFilter({
        createdAt: {
          $gt: '2022-11-28T11:58:37.051Z',
        },
      })
    );
  }

  async ngOnInit() {
    client.ping().then(() => console.timeEnd('startup'));

    const users = await query<User>({
      collection: 'User',
    })
      .projection({
        name: 1,
      })
      .limit(2)
      .filter({
        createdAt: {
          $gt: '2022-11-28T11:58:37.051Z',
        },
      })
      .sort({
        createdAt: -1,
      })
      .find({
        allowDiskUse: true,
      });

    console.log(users);
  }
}
