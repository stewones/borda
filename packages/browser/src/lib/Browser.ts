/* eslint-disable @typescript-eslint/no-explicit-any */

import { EnhancedStore } from '@reduxjs/toolkit';

export interface BrowserParams {
  debug?: boolean;
  reducers?: any;
}

export interface BrowserProtocol {
  debug: boolean;
  store: EnhancedStore;
  reducers: any;
}

export const EleganteBrowser: BrowserProtocol = {
  debug: true,
  reducers: {},
  store: null as any,
};
