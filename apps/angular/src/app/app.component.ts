import { Component } from '@angular/core';
import { createClient, pointer, query } from '@elegante/sdk';

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
    //  client.ping().then(() => console.timeEnd('startup'));
  }

  async ngOnInit() {
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

    /**
     * pointer example
     */
    // const sales = await query()
    //   .collection('Sale')
    //   .projection({
    //     author: 1,
    //     product: 1,
    //     objectId: -1,
    //     createdAt: 1,
    //     total: 1,
    //   })
    //   .join([
    //     'author',
    //     'product',
    //     'product.scrape',
    //     'product.author',
    //     'product.scrape.scrape',
    //   ])
    //   .filter({
    //     product: {
    //       $eq: pointer('Product', 'MCU8z2gBoM'),
    //     },
    //     createdAt: {
    //       $gt: '2021-11-20T11:58:37.051Z',
    //     },
    //     $and: [
    //       {
    //         createdAt: {
    //           $gt: '2022-11-20T11:58:37.051Z',
    //         },
    //       },
    //       {
    //         total: {
    //           $gt: 100,
    //         },
    //       },
    //       {
    //         total: {
    //           $lt: 1000,
    //         },
    //       },
    //     ],
    //   })
    //   .sort({
    //     total: -1,
    //   })
    //   .limit(2)
    //   .find({
    //     allowDiskUse: true,
    //   });

    // console.log('sales', sales.length);

    /**
     * aggregate
     */
    const salesAgg = await query()
      .collection('Sale')
      .join(['author', 'product.author'])
      .exclude(['count', 'origin', 'originId', 'cumulative'])
      .pipeline([
        {
          $match: {
            createdAt: {
              $gt: '2022-11-28T11:58:37.051Z',
            },
          },
        },

        {
          $addFields: {
            product: {
              $substr: ['$_p_product', 8, -1],
            },
          },
        },
        {
          $lookup: {
            from: 'Product',
            localField: 'product',
            foreignField: '_id',
            as: 'product',
          },
        },
        {
          $unwind: {
            path: '$product',
          },
        },
        {
          $match: {
            'product.name': {
              $regex: 'Real Media Library',
            },
          },
        },
        {
          $limit: 1,
        },
        {
          $unset: ['_p_product'],
        },
      ])
      .aggregate();

    console.log('salesAgg', salesAgg);
  }
}
