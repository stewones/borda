import { provideExperimentalZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import {
  PreloadAllModules,
  provideRouter,
  withInMemoryScrolling,
  withPreloading,
} from '@angular/router';

import { BordaClient, isServer, Session } from '@borda/client';

import { AppComponent } from './app/AppComponent';
import { AppRoutes } from './app/AppRoutes';
import { borda, insta, sessionSet } from './app/borda';
import { environment } from './environment';

/**
 * Setup Instant Worker
 */
if (typeof Worker !== 'undefined') {
  const worker = new Worker(new URL('./app/insta.worker', import.meta.url));
  insta.setWorker({ worker });
}

const startup = [borda.browser(), insta.ready()];

Promise.allSettled(startup)
  .then(async () => {
    /**
     * dispatch session before initializing angular app
     */
    const session = await borda.cache.get<Session>('session');

    if (session) {
      borda.dispatch(sessionSet(session));
      borda.auth.become({
        token: session.token,
        validateSession: false,
      });
    }

    /**
     * bootstrap angular app
     */
    bootstrapApplication(AppComponent, {
      providers: [
        provideExperimentalZonelessChangeDetection(),
        provideRouter(
          AppRoutes,
          withPreloading(PreloadAllModules),
          withInMemoryScrolling({
            scrollPositionRestoration: 'enabled', // Set the scroll position restoration to 'top'
            anchorScrolling: 'enabled', // Enable anchor scrolling
          })
        ),
      ],
    });
  })
  .catch((err) => {
    console.error(err);
  });

if (!isServer()) {
  if (!environment.production) {
    // @ts-ignore
    borda['pubsub'] = BordaClient.pubsub;
    // @ts-ignore
    window['borda'] = borda;
  }
}

