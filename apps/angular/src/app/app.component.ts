import { Component } from '@angular/core';
import { createClient, parseFilter, query } from '@elegante/sdk';

console.time('startup');

const client = createClient({
  apiKey: 'ELEGANTE_SERVER',
  serverURL: 'http://localhost:3135/server',
  debug: true,
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
    // console.log(
    //   parseFilter({
    //     createdAt: {
    //       $gt: '2022-11-28T11:58:37.051Z',
    //     },
    //   })
    // );
  }

  async ngOnInit() {
    client.ping().then(() => console.timeEnd('startup'));

    // const users = await query<User>()
    //   .collection('User')
    //   .projection({
    //     name: 1,
    //   })
    //   .limit(2)
    //   .filter({
    //     createdAt: {
    //       $gt: '2022-11-28T11:58:37.051Z',
    //     },
    //   })
    //   .sort({
    //     createdAt: -1,
    //   })
    //   .find({
    //     allowDiskUse: true,
    //   });

    // if (users?.length) console.log('users', users);

    // pointers
    const sales = await query()
      .collection('Sale')
      .projection({
        author: 1,
        product: 1,
        objectId: -1,
        createdAt: 1,
      })
      .join(['author', 'product', 'product.scrape', 'product.author', 'x.y.z']) // ','product.author.some.other.collection',
      .filter({
        createdAt: {
          $gt: '2021-11-28T11:58:37.051Z',
        },
        // @todo recursive parse filter $and $or, etc to use Date Object
        // $and: [
        //   {
        //     createdAt: {
        //       $gt: '2021-11-28T11:58:37.051Z',
        //     },
        //   },
        //   {
        //     total: {
        //       $gt: 100,
        //     },
        //   },
        //   {
        //     total: {
        //       $lt: 1000,
        //     },
        //   },
        // ],

        // @todo matchesQuery
        // @workaround lookup
      })
      .sort({
        total: -1,
      })
      .limit(2)
      .find()
      .catch((err) => console.log(err));

    if (sales?.length) console.log('sales', sales);
  }
}
