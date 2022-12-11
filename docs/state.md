- The state is diveded into two groups:
-
- 1 - The state of a query result.
-     - They have its own reducer and are stored in the state tree under the `$docs` key.
-     - You can use the arbitrary function `setDocState(key, value)` to set/update the state of a query result.
-       Please be aware of this approach as it may lead to unmaintainable code as the app grows. Try to always default to the redux way which is
-       creating your own reducers + actions. Refer to the app example where it creates a custom Session reducer.
-     - The state key is auto generated based on the query parameters
-       but you can specify a custom key as first parameter if needed.
-       ie:
-           fast(
-             'latest-10',
-             from (
-              query('PublicUser')
-               .limit(10)
-               .filter({ active: true })
-               .sort({ createdAt: -1 })
-               .find({ allowDiskUse: true })
-             )
-          ).subscribe(results);
-
- 2 - The state of the application.
-     They are stored in the root of the state tree and are controlled by the reducers you create in a redux-style way.
-     For more information on how to work with reducers and actions, please refer to the Redux documentation and the example app.

## ❗ needs to experiment

function createPublicUserListener(target: any) {
return listener<User[]>('publicUsers').pipe(
takeUntil(target.publicUsersReset$),
    finalize(() => {
      target.publicUsers$ = createPublicUserListener(target);
}),
switchMap(() =>
fast('getPublicUsers', from(runFunction<User[]>('getPublicUsers')))
)
);
}
publicUsers$ = createPublicUserListener(this)
