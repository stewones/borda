/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { EnhancedStore } from '@reduxjs/toolkit';

import { FastOptions } from './fast';

export interface BrowserParams {
  debug?: boolean;
  reducers?: any;
  fast?: Pick<FastOptions, 'mode' | 'differ' | 'mutable'>;
}

export interface BrowserProtocol {
  store: EnhancedStore;
  params: BrowserParams;
}

export const EleganteBrowser: BrowserProtocol = {
  store: null as any,
  params: {
    debug: true,
    reducers: {},
    fast: {
      mode: 'straight',
    },
  } as BrowserParams,
};
