// // import './preload';

import { Elysia } from 'elysia';

// import { addPowered } from '../src/lib';

// jest.mock('elysia', () => {
//   const mockElysia = jest.fn().mockImplementation(() => ({
//     get: jest.fn().mockReturnValue(true),
//     post: jest.fn().mockReturnValue(true),
//     put: jest.fn().mockReturnValue(true),
//     delete: jest.fn().mockReturnValue(true),
//     patch: jest.fn().mockReturnValue(true),
//     head: jest.fn().mockReturnValue(true),
//     options: jest.fn().mockReturnValue(true),
//     listen: jest.fn().mockReturnValue(true),
//     use: jest.fn().mockReturnValue(true),
//     onAfterHandle: jest.fn(),
//     onRequest: jest.fn(),
//     all: jest.fn(),
//   }));

//   return mockElysia;
// });

// // jest.mock('elysia', () => {
// //   return {
// //     __esModule: true, // this property makes it work
// //     default: jest.fn().mockImplementation(() => ({
// //       get: jest.fn().mockReturnValue(true),
// //       post: jest.fn().mockReturnValue(true),
// //       put: jest.fn().mockReturnValue(true),
// //       delete: jest.fn().mockReturnValue(true),
// //       patch: jest.fn().mockReturnValue(true),
// //       head: jest.fn().mockReturnValue(true),
// //       options: jest.fn().mockReturnValue(true),
// //       listen: jest.fn().mockReturnValue(true),
// //       use: jest.fn().mockReturnValue(true),
// //       onAfterHandle: jest.fn(),
// //       onRequest: jest.fn(),
// //       all: jest.fn(),
// //     })),
// //   };
// // });

// // interface MockedElysia extends Elysia {
// //   use: jest.Mock;
// // }
// describe('Borda Rest', () => {
//   let server: Elysia;
//   beforeEach(() => {
//     server = new Elysia();
//   });
//   it('should add powered by', () => {
//     //  const app: any = edenTreaty<any>('http://localhost:1337');

//     // app.get('/mirror', () => 'hi');

//     // const { data } = app.get();

//     addPowered({
//       by: 'borda-ci',
//       server,
//     });

//     expect(true).toBe(true);
//   });
// });

// jest.mock('elysia', () => {
//   const mockElysia = jest.fn().mockImplementation(() => ({
//     get: jest.fn().mockReturnValue(true),
//   }));

//   return mockElysia;
// });

test('Elysia get method', async () => {
  //   const elysiaInstance = new Elysia();
  //   const mockCallback = jest.fn();
  //   expect(elysiaInstance.get('/', mockCallback)).toBe(true);
  const app = new Elysia().get('/', ({ set }) => {
    set.headers['Server'] = 'Elysia';

    return 'hi';
  });

  const res = await app.handle(new Request('http://localhost'));
  expect(res.status).toBe(200);
});
