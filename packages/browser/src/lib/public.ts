/**
 * @license
 * Copyright Intenseloop LTD All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

import { BrowserParams, EleganteBrowser } from './Browser';
import { $doc, createStore } from './redux';

export function load(params?: BrowserParams) {
  EleganteBrowser.debug = params?.debug ?? EleganteBrowser.debug;
  EleganteBrowser.store = createStore({
    reducers: { ...params?.reducers, $doc: $doc() },
  });
}
