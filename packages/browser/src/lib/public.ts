/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

import {
  BrowserParams,
  EleganteBrowser,
} from './Browser';
import {
  $doc,
  createStore,
} from './redux';

export function load(params?: BrowserParams) {
  EleganteBrowser.params = { ...EleganteBrowser.params, ...params };
  EleganteBrowser.store = createStore({
    reducers: { ...params?.reducers, $doc: $doc() },
  });
}
