/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */
import { IndexedDB } from '@elegante/sdk';

import { BrowserParams, EleganteBrowser } from './Browser';
import { $doc, createStore } from './redux';

export async function load(params?: BrowserParams) {
  EleganteBrowser.params = { ...EleganteBrowser.params, ...params };
  EleganteBrowser.store = createStore({
    reducers: { ...params?.reducers, $doc: $doc() },
  });

  const adapter = params?.fast?.storage?.adapter ?? false;

  if (adapter) {
    EleganteBrowser.storage = adapter;
  } else {
    EleganteBrowser.storage = await IndexedDB.load({
      name: params?.fast?.storage?.name ?? 'elegante',
      store: params?.fast?.storage?.store ?? 'app',
      version: params?.fast?.storage?.version ?? 1,
    });
  }
}
