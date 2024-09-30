import {
  enableProdMode,
  provideExperimentalZonelessChangeDetection,
} from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import {
  PreloadAllModules,
  provideRouter,
  withInMemoryScrolling,
  withPreloading,
} from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';

import { BordaClient, isServer } from '@borda/client';

import { AppComponent } from './app/AppComponent';
import { AppRoutes } from './app/AppRoutes';
import { borda, insta } from './app/borda';
import { environment } from './environment';

if (environment.production) {
  enableProdMode();
}

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
    const session = (await insta.cache.get('session')) || {};
    if (session.token) {
      await insta.cloud.sync({
        session,
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
        provideServiceWorker('ngsw-worker.js', {
          enabled: environment.production,
          registrationStrategy: 'registerWhenStable:30000',
        }),
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
