// interface User {
//   name: string;
//   age: number;
//   location: string;
//   friends: {
//     today: User[];
//     yesterday: User[];
//   };
// }

// const array: User[] = [
//   {
//     name: 'Alice',
//     age: 30,
//     location: 'New York',
//     friends: {
//       today: [
//         {
//           name: 'Bob',
//           age: 35,
//           location: 'San Francisco',
//           friends: {
//             today: [],
//             yesterday: [],
//           },
//         },
//       ],
//       yesterday: [],
//     },
//   },
//   {
//     name: 'Bob',
//     age: 35,
//     location: 'San Francisco',
//     friends: {
//       today: [],
//       yesterday: [],
//     },
//   },
// ];

describe.skip('parseProjection', () => {
  it('skips', () => {
    expect(true).toBe(true);
  });
  // test('returns all fields but the excluded ones', () => {
  //   expect(parseProjection({ name: 0, age: 0 }, array)).toEqual([
  //     {
  //       location: 'New York',
  //       friends: {
  //         today: [
  //           {
  //             name: 'Bob',
  //             age: 35,
  //             location: 'San Francisco',
  //             friends: {
  //               today: [],
  //               yesterday: [],
  //             },
  //           },
  //         ],
  //         yesterday: [],
  //       },
  //     },
  //     {
  //       location: 'San Francisco',
  //       friends: {
  //         today: [],
  //         yesterday: [],
  //       },
  //     },
  //   ]);
  // });
  // test('returns all fields but the excluded ones considering nested objects', () => {
  //   expect(
  //     parseProjection(
  //       { location: 0, age: 0, father: { age: 0, location: 0 } },
  //       {
  //         name: 'Alice',
  //         age: 30,
  //         location: 'New York',
  //         father: {
  //           name: 'Bob',
  //           age: 35,
  //           location: 'San Francisco',
  //         },
  //       }
  //     )
  //   ).toEqual({
  //     name: 'Alice',
  //     father: {
  //       name: 'Bob',
  //     },
  //   });
  // });
  // test('returns all fields but the excluded ones considering deeply nested objects', () => {
  //   expect(
  //     parseProjection({ name: 0, friends: { today: { name: 0 } } }, array)
  //   ).toEqual([
  //     {
  //       age: 30,
  //       location: 'New York',
  //       friends: {
  //         today: [
  //           {
  //             age: 35,
  //             location: 'San Francisco',
  //             friends: {
  //               today: [],
  //               yesterday: [],
  //             },
  //           },
  //         ],
  //         yesterday: [],
  //       },
  //     },
  //     {
  //       age: 35,
  //       location: 'San Francisco',
  //       friends: {
  //         today: [],
  //         yesterday: [],
  //       },
  //     },
  //   ]);
  // });
  // test('filters array with projection to only include specified properties', () => {
  //   expect(parseProjection({ name: 1 }, array)).toEqual([
  //     { name: 'Alice' },
  //     { name: 'Bob' },
  //   ]);
  // });
  // test('filters array with projection to exclude specified properties', () => {
  //   expect(parseProjection({ name: 1, age: 0 }, array)).toEqual([
  //     { name: 'Alice' },
  //     { name: 'Bob' },
  //   ]);
  // });
  // test('filters array with projection to include and exclude specified properties', () => {
  //   expect(parseProjection({ name: 1, age: 1 }, array)).toEqual([
  //     { name: 'Alice', age: 30 },
  //     { name: 'Bob', age: 35 },
  //   ]);
  // });
  // test('filters array with projection to include nested property', () => {
  //   expect(
  //     parseProjection({ name: 1, friends: { today: { name: 1 } } }, array)
  //   ).toEqual([
  //     { name: 'Alice', friends: { today: [{ name: 'Bob' }], yesterday: [] } },
  //     { name: 'Bob', friends: { today: [], yesterday: [] } },
  //   ]);
  // });
  // test('filters object with many nested projections to only include specified properties', () => {
  //   expect(
  //     parseProjection(
  //       {
  //         name: 1,
  //         age: 1,
  //         location: 0,
  //         pets: 1,
  //         skills: { name: 1 },
  //         friends: { today: { name: 1, age: 1 } },
  //       },
  //       {
  //         name: 'Alice',
  //         age: 30,
  //         location: 'New York',
  //         pets: ['cat', 'dog'],
  //         skills: [
  //           {
  //             name: 'JavaScript',
  //             level: 'Advanced',
  //           },
  //           {
  //             name: 'TypeScript',
  //             level: 'Advanced',
  //           },
  //         ],
  //         friends: {
  //           today: [
  //             {
  //               name: 'Bob',
  //               age: 35,
  //               location: 'San Francisco',
  //               friends: {
  //                 today: [
  //                   {
  //                     name: 'Bob',
  //                     age: 35,
  //                     location: 'San Francisco',
  //                     friends: {
  //                       today: [],
  //                       yesterday: [],
  //                     },
  //                   },
  //                 ],
  //                 yesterday: [],
  //               },
  //             },
  //           ],
  //           yesterday: [],
  //         },
  //       }
  //     )
  //   ).toEqual({
  //     name: 'Alice',
  //     age: 30,
  //     pets: ['cat', 'dog'],
  //     skills: [
  //       {
  //         name: 'JavaScript',
  //       },
  //       {
  //         name: 'TypeScript',
  //       },
  //     ],
  //     friends: { today: [{ name: 'Bob', age: 35 }], yesterday: [] },
  //   });
  // });
  // test('filters object with projection to exclude specified properties', () => {
  //   expect(parseProjection({ name: 1, age: 0 }, array[0])).toEqual({
  //     name: 'Alice',
  //   });
  // });
  // test('filters object with projection to include and exclude specified properties', () => {
  //   expect(parseProjection({ name: 1, age: 1 }, array[0])).toEqual({
  //     name: 'Alice',
  //     age: 30,
  //   });
  // });
  // test('filters object with projection to include nested property', () => {
  //   expect(
  //     parseProjection({ name: 1, friends: { today: { name: 1 } } }, array[0])
  //   ).toEqual({
  //     name: 'Alice',
  //     friends: { today: [{ name: 'Bob' }], yesterday: [] },
  //   });
  // });
  // test('filters object with projection to exclude nested property', () => {
  //   expect(
  //     parseProjection({ name: 1, friends: { today: { name: 0 } } }, array[0])
  //   ).toEqual({
  //     name: 'Alice',
  //     friends: {
  //       today: [
  //         {
  //           age: 35,
  //           location: 'San Francisco',
  //           friends: {
  //             today: [],
  //             yesterday: [],
  //           },
  //         },
  //       ],
  //       yesterday: [],
  //     },
  //   });
  // });
});
