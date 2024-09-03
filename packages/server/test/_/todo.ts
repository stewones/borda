// function runLiveQueryTest() {
//     // using borda server instance to subscribe to live queries
//     borda
//       .query<{
//         name: string;
//         age: number;
//       }>('Person')
//       .filter({
//         age: {
//           $gte: 18,
//         },
//       })
//       .on('insert')
//       .subscribe(({ doc }) =>
//         console.log('⚡LiveQuery (server): new person', doc)
//       );

//     // using borda client instance to subscribe to live queries
//     client
//       .query('Person')
//       .unlock() // comment to throw error
//       .filter({
//         age: {
//           $gte: 18,
//         },
//       })
//       .on('insert')
//       .subscribe({
//         next: ({ doc }) => {
//           console.log('⚡LiveQuery (client): new person', doc);
//         },
//         error: (err) => {
//           console.log('⚡LiveQuery (client):', err);
//         },
//       });

//     // once
//     client
//       .query('Person')
//       .unlock() // comment to throw error
//       .filter({
//         age: {
//           $gte: 18,
//         },
//       })
//       .limit(2)
//       .once()
//       .subscribe({
//         next: ({ docs }) => {
//           console.log('⚡LiveQuery (client) once: persons', docs);
//         },
//         error: (err) => {
//           console.log('⚡LiveQuery (client) once:', err);
//         },
//       });

//     borda
//       .query('Person')
//       .filter({
//         age: {
//           $gte: 18,
//         },
//       })
//       .limit(2)
//       .once()
//       .subscribe({
//         next: ({ docs }) => {
//           console.log('⚡LiveQuery (server) once: persons', docs);
//         },
//         error: (err) => {
//           console.log('⚡LiveQuery (server) once:', err);
//         },
//       });
//   }

//   async function runQueryClientTest() {
//     // insert using client + unlock
//     await client
//       .query('Person')
//       .unlock()
//       .insert({
//         name: 'Jane',
//         age: 25,
//       })
//       .then((person) => console.log('new person inserted by rest', person))
//       .catch((err) => {
//         console.log(err);
//         // process.exit(1); // stops the server for the sake of the example. don't do this in production.
//       });

//     // find using client + unlock
//     await client
//       .query('Person')
//       .unlock()
//       .limit(2)
//       .find()
//       .then((people) => console.log('people by rest', people))
//       .catch((err) => console.log(err));

//     // execute a function
//     await client.cloud
//       .run('getCounter')
//       .then((counter) => console.log('counter', counter))
//       .catch((err) => console.log(err));
//   }

//   async function runQueryServerTest() {
//     // findOne
//     await borda
//       .query('Person')
//       .filter({
//         age: {
//           $gte: 29,
//         },
//       })
//       .findOne()
//       .then((person) => console.log('a person', person))
//       .catch((err) => console.log(err));

//     // removeMany
//     await borda
//       .query('Person')
//       .filter({
//         age: {
//           $gte: 18,
//         },
//       })
//       .deleteMany()
//       .then((response) => console.log('people deleted', response))
//       .catch((err) => console.log(err));

//     // insertMany
//     await borda
//       .query('Person')
//       .insertMany([
//         {
//           name: 'John',
//           age: 30,
//         },
//         {
//           name: 'Jane',
//           age: 25,
//         },
//       ])
//       .then((people) => console.log('many inserted people', people))
//       .catch((err) => console.log(err));

//     // aggregate
//     await borda
//       .query('Person')
//       .pipeline([
//         {
//           $match: {
//             age: {
//               $gte: 29,
//             },
//           },
//         },
//         {
//           $group: {
//             _id: '$name',
//             total_age: {
//               $sum: '$age',
//             },
//           },
//         },
//         {
//           $sort: {
//             total: -1,
//           },
//         },
//         {
//           $addFields: {
//             name: '$_id',
//           },
//         },
//         {
//           $project: {
//             _id: 0,
//             name: 1,
//             total_age: 1,
//           },
//         },
//       ])
//       .aggregate()
//       .then((agg) => console.log('aggregated people', agg))
//       .catch((err) => console.log(err));

//     // count
//     await borda
//       .query('Person')
//       .filter({
//         age: {
//           $gte: 29,
//         },
//       })
//       .count()
//       .then((count) => console.log('count people', count))
//       .catch((err) => console.log(err));

//     // insert + remove
//     await borda
//       .query('Person')
//       .insert({
//         name: 'Jane',
//         age: 25,
//       })
//       .then((person) => console.log('jane person inserted', person))
//       .catch((err) => console.log(err));

//     await borda
//       .query('Person')
//       .filter({
//         name: 'Jane',
//       })
//       .delete()
//       .then(() => console.log('jane person removed'))
//       .catch((err) => console.log(err));

//     // insert john
//     await borda
//       .query('Person')
//       .insert({
//         name: 'John',
//         age: 30,
//       })
//       .then((person) => console.log('john person inserted', person))
//       .catch((err) => console.log(err));

//     // update
//     await borda
//       .query('Person')
//       .filter({
//         name: 'John',
//       })
//       .update({
//         $inc: {
//           age: 1,
//         },
//         $set: {
//           _updated_at: new Date(),
//         },
//       })
//       .then((response) => console.log('people updated', response))
//       .catch((err) => console.log(err));

//     // find again
//     await borda
//       .query('Person')
//       .find()
//       .then((people) => console.log('people', people))
//       .catch((err) => console.log(err));

//     // update many
//     await borda
//       .query('Person')
//       .filter({
//         name: {
//           $exists: true,
//         },
//       })
//       .updateMany({
//         $inc: {
//           age: 1,
//         },
//         $set: {
//           _updated_at: new Date(),
//         },
//       })
//       .then((response) => console.log('people updated', response))
//       .catch((err) => console.log(err));

//     // upsert
//     await borda
//       .query('Person')
//       .filter({
//         name: 'Joe',
//       })
//       .upsert({
//         name: 'Joe',
//         age: 18,
//       })
//       .then((response) =>
//         console.log('person upserted', JSON.stringify(response, null, 2))
//       )
//       .catch((err) => console.log(err));

//     // upsertMany
//     await borda
//       .query('Person')
//       .filter({
//         name: '$$name',
//       })
//       .upsertMany([
//         {
//           name: 'Joe',
//           age: 20,
//         },
//         {
//           name: 'Jane',
//           age: 27,
//         },
//         {
//           name: 'Kat',
//           age: 19,
//         },
//       ])
//       .then((response) =>
//         console.log('people upserted', JSON.stringify(response, null, 2))
//       )
//       .catch((err) => console.log(err));

//     // insert + include
//     const userToInclude: any = await borda
//       .query('Person')
//       .insert({
//         name: 'Elon',
//         age: 42,
//       })
//       .catch((err) => console.log(err));

//     // insert a pointer
//     await borda
//       .query('Post')
//       .insert({
//         title: 'My first post',
//         user: pointer('User', userToInclude.objectId),
//       })
//       .then((post) => console.log('post inserted', post))
//       .catch((err) => console.log(err));

//     // query posts
//     await borda
//       .query<{ title: string; user: any }>('Post')
//       .include(['user'])
//       .find()
//       .then((posts) => console.log('posts', posts))
//       .catch((err) => console.log(err));

//     // update by id (put)
//     await borda
//       .query('Person')
//       .update(userToInclude.objectId, {
//         name: 'John',
//         age: 33,
//       })
//       .then(() => console.log('updated person'))
//       .catch((err) => console.log(err));

//     // get by id (get)
//     await borda
//       .query<{ name: string; age: number }>('Person')
//       .findOne(userToInclude.objectId)
//       .then((person) => console.log('person', person))
//       .catch((err) => console.log(err));

//     // update
//     await borda
//       .query('Person')
//       .update(userToInclude.objectId, {
//         name: 'Elon Musk',
//       })
//       .then(() => console.log('updated person'))
//       .catch((err) => console.log(err));

//     // clean up posts
//     await borda
//       .query('Post')
//       .filter({
//         title: {
//           $exists: true,
//         },
//       })
//       .deleteMany()
//       .then((response) => console.log('posts deleted', response))
//       .catch((err) => console.log(err));
//   }
