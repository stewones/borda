import { BrowserParams, EleganteBrowser } from './Browser';
import { $docs, createStore } from './redux';

export function load(params?: BrowserParams) {
  EleganteBrowser.debug = params?.debug ?? EleganteBrowser.debug;
  EleganteBrowser.store = createStore({
    reducers: { ...params?.reducers, $docs: $docs() },
  });
}
