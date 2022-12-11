import { BrowserParams, EleganteBrowser } from './Browser';
import { $doc, createStore } from './redux';

export function load(params?: BrowserParams) {
  EleganteBrowser.debug = params?.debug ?? EleganteBrowser.debug;
  EleganteBrowser.reducers = { ...params?.reducers, $doc: $doc() };
  EleganteBrowser.store = createStore({
    reducers: EleganteBrowser.reducers,
  });
}
