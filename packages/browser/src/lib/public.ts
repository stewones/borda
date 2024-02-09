/**
 * @license
 * Copyright Borda All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://borda.dev/license
 */
import { IndexedDB } from '@borda/client';

import { BordaBrowser, BrowserParams } from './Browser';
import { $doc, createStore } from './redux';

export async function load(params?: BrowserParams) {
  BordaBrowser.params = { ...BordaBrowser.params, ...params };
  BordaBrowser.store = createStore({
    reducers: { ...params?.reducers, $doc: $doc() },
  });

  const adapter = params?.fast?.storage?.adapter ?? false;

  if (adapter) {
    BordaBrowser.storage = adapter;
  } else {
    BordaBrowser.storage = await IndexedDB.load({
      name: params?.fast?.storage?.name ?? 'borda',
      store: params?.fast?.storage?.store ?? 'app',
      version: params?.fast?.storage?.version ?? 1,
    });
  }
}
