import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { createClient, pointer, query } from '@elegante/sdk';
import { from, map, Subscribable, Subscription, tap } from 'rxjs';

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
  imports: [CommonModule],
  selector: 'elegante-root',
  template: `
    <button (click)="increase()">Increase Total: {{ total$ | async }}</button>
    <button (click)="reload()">
      Next Total: {{ total }} (Reload the page)
    </button>
    <button (click)="unsubscribe()">Unsubscribe Realtime</button>
  `,
  styles: [],
})
export class AppComponent {
  total$ = from(
    query<{
      objectId: string;
      total: number;
    }>()
      .collection('Sale')
      .filter({
        objectId: {
          $eq: 'kpg5YGSEBn',
        },
      })
      .findOne()
  ).pipe(
    map((sale) => sale?.total ?? 0),
    tap((total) => (this.total = total))
  );
  total = 0;

  realtime$: Subscription | undefined;

  constructor() {
    //  client.ping().then(() => console.timeEnd('startup'));
  }

  increase() {
    ++this.total;
    query<{
      objectId: string;
      total: number;
    }>()
      .collection('Sale')
      .filter({
        objectId: {
          $eq: 'kpg5YGSEBn',
        },
      })
      .update({
        total: this.total,
      });
  }

  reload() {
    window.location.reload();
  }

  ngOnDestroy() {}

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
    // const salesAgg = await query()
    //   .collection('Sale')
    //   .include([
    //     'author',
    //     'product.author',
    //     'product.category',
    //     'product.scrape.scrape',
    //   ])
    //   .exclude([
    //     'count',
    //     'origin',
    //     'originId',
    //     'cumulative',
    //     'product.content',
    //     'product.badges',
    //     'product.tags',
    //     'product.originLastSync',
    //     // for security some fields are excluded by default (with possibility to disable this in server with query.unlock(true))
    //     // 'product.author._acl',
    //     // 'product.author._hashed_password',
    //     // 'product.author._wperm',
    //     // 'product.author._rperm',
    //   ])
    //   .unlock(true)
    //   .pipeline([
    //     {
    //       $match: {
    //         createdAt: {
    //           $gt: '2022-11-28T11:58:37.051Z',
    //         },
    //       },
    //     },
    //     {
    //       $addFields: {
    //         product: {
    //           $substr: ['$_p_product', 8, -1],
    //         },
    //       },
    //     },
    //     {
    //       $lookup: {
    //         from: 'Product',
    //         localField: 'product',
    //         foreignField: '_id',
    //         as: 'product',
    //       },
    //     },
    //     {
    //       $unwind: {
    //         path: '$product',
    //       },
    //     },
    //     {
    //       $match: {
    //         'product.name': {
    //           $regex: 'Real Media Library',
    //         },
    //       },
    //     },
    //     {
    //       $limit: 1,
    //     },
    //     {
    //       $unset: ['_p_product'],
    //     },
    //   ])
    //   .aggregate();
    // console.log('salesAgg', salesAgg);

    this.liveQuery();
    // this.liveQuery();
  }

  unsubscribe() {
    this.realtime$?.unsubscribe();
  }

  async liveQuery() {
    const salesLiveQuery = query()
      .collection('Sale')
      // .include([
      //   'author',
      //   'product.author',
      //   // 'product.category',
      //   // 'product.scrape.scrape',
      // ])
      // .exclude([
      //   'count',
      //   'origin',
      //   'originId',
      //   'cumulative',
      //   'product.content',
      //   'product.badges',
      //   'product.tags',
      //   'product.originLastSync',
      //   // for security some fields are excluded by default (with possibility to disable this in server with query.unlock(true))
      //   // 'product.author._acl',
      //   // 'product.author._hashed_password',
      //   // 'product.author._wperm',
      //   // 'product.author._rperm',
      // ])
      // .filter({
      //   product: {
      //     $eq: pointer('Product', 'MCU8z2gBoM'),
      //   },
      //   // createdAt: {
      //   //   $gt: '2021-11-20T11:58:37.051Z',
      //   // },
      //   // $and: [
      //   //   {
      //   //     createdAt: {
      //   //       $gt: '2022-11-20T11:58:37.051Z',
      //   //     },
      //   //   },
      //   //   {
      //   //     total: {
      //   //       $gt: 100,
      //   //     },
      //   //   },
      //   //   {
      //   //     total: {
      //   //       $lt: 1000,
      //   //     },
      //   //   },
      //   // ],
      // })
      .pipeline([
        {
          // $match: {
          //   createdAt: {
          //     $gt: '2022-11-28T11:58:37.051Z',
          //   },
          // },
          $match: {
            // createdAt: {
            //   $gt: '2022-11-28T11:58:37.051Z',
            // },
            // _p_product: pointer('Product', 'MCU8z2gBoM'),
            _p_product: {
              $eq: pointer('Product', 'MCU8z2gBoM'),
            },
          },
        },
        // {
        //   $addFields: {
        //     product: {
        //       $substr: ['$_p_product', 8, -1],
        //     },
        //   },
        // },
        // {
        //   $lookup: {
        //     from: 'Product',
        //     localField: 'product',
        //     foreignField: '_id',
        //     as: 'product',
        //   },
        // },
        // {
        //   $unwind: {
        //     path: '$product',
        //   },
        // },
        // {
        //   $match: {
        //     'product.name': {
        //       $regex: 'system',
        //       $options: 'i',
        //     },
        //   },
        // },
        // {
        //   $limit: 2,
        // },
        // {
        //   $unset: ['_p_product'],
        // },
      ])
      // .sort({
      //   total: -1,
      // })
      // .limit(2)
      .on('update');
    //.aggregate();
    // .on('find');

    this.realtime$ = salesLiveQuery.subscribe({
      next: (data) => {
        console.log('data', data);
      },
      error: (error) => {
        console.log('error', error);
      },
    });
  }
}
