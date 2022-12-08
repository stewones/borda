import { Document, get, isEmpty } from '@elegante/sdk';

import { store } from '../store';

export interface SetStateOptions {
  saveCache?: boolean;
}

/**
 * Synchronously grab a piece of data from state
 * If path isn't specified, the whole state is returned.
 *
 * The state is diveded into two groups:
 *
 * 1 - The state of a query result.
 *     - They have its own reducer and are stored in the state tree under the `_Docs` key.
 *     - You can use the arbitrary function `setDocState(key, value)` to set/update the state of a query result.
 *       Please be aware of this approach as it may lead to unmaintainable code as the app grows. Try to always default to the redux way.
 *     - They are memoized and are updated only when the query is executed via `query(...).run(name)`
 *       where "name" applies for `get`, `find`, `findOne`, `aggregate` and `count`. Basically all the methods that retrieve data. (no support for realtime)
 *     - The state key is auto generated based on the query parameters
 *       but you can specify a custom key alongside the query chain being provided to `fast`.
 *       ie:
 *           fast(
 *             query('PublicUser')
 *               .limit(10)
 *               .filter()
 *               .sort()
 *               .run('find'),
 *             { key: 'latest-10' }
 *          ).subscribe(results);
 *
 * 2 - The state of the application.
 *     They are stored in the root of the state tree and are controlled by the reducers you create in a redux-style way.
 *     For more information on how to work with reducers and actions, please refer to the Redux documentation.
 *     Elegante also provide helpers for you to create and benefit from all of that in a simpler way. Check out the example app.
 *
 * @export
 * @template T
 * @param {string} [path]
 * @returns {*}  {T}
 */
export function getState<T = Document>(path?: string): T {
  const currentState = store().getState();
  if (path) {
    // attempt to get current data from user reducer
    let doc = get(currentState, path);
    // otherwise attempt to get from memoized docs
    if (isEmpty(doc)) {
      doc = get(currentState, `_Docs.${path}`);
    }
    return doc;
  }
  return currentState;
}

export function setState(
  key: string,
  value: Document,
  options: SetStateOptions = { cache: true }
) {
  dispatch({
    type: 'networkStateUpdate',
    key: key,
    value: value,
  });

  if (workspace.storage && options.cache) {
    try {
      workspace.storage.set(key, value);
    } catch (err) {}
  }
}

export function resetState() {
  dispatch({
    type: '_Docs_Reset',
  });
}
