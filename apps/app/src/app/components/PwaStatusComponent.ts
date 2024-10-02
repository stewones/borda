import { toast } from 'ngx-sonner';
import { BehaviorSubject, interval } from 'rxjs';
import { filter } from 'rxjs/operators';

import { CommonModule } from '@angular/common';
import { Component, computed, inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { SwUpdate, VersionEvent } from '@angular/service-worker';

import { provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideDownload,
  lucideRefreshCw,
  lucideTriangleAlert,
} from '@ng-icons/lucide';
import { HlmIconComponent } from '@spartan-ng/ui-icon-helm';

export type PwaUpdateStatus =
  | 'not_available'
  | 'available'
  | 'updating'
  | 'error';

export interface PwaUpdateState {
  status: PwaUpdateStatus;
  error?: Error;
}

@Injectable({
  providedIn: 'root',
})
export class PwaUpdateRef {
  sw = inject(SwUpdate);

  state = new BehaviorSubject<PwaUpdateState>({
    status: 'not_available',
  });

  constructor() {
    if (this.sw.isEnabled) {
      this.listenForUpdates();
      this.checkForUpdate();
      interval(10_000).subscribe(() => this.checkForUpdate());
    } else {
      console.warn('Service Worker updates are disabled.');
    }
  }

  checkForUpdate() {
    this.sw
      .checkForUpdate()
      .then((newVersionAvailable) => {
        console.log('Checked for app updates', newVersionAvailable);
      })
      .catch((error) => {
        console.error('Failed to check for updates:', error);
        this.state.next({ status: 'error', error });
      });
  }

  private listenForUpdates(): void {
    this.sw.unrecoverable.subscribe((event) => {
      console.error('SW update unrecoverable:', event.reason);
      toast('App update error', {
        description: event.reason,
      });
      this.state.next({
        status: 'error',
        error: new Error(event.reason),
      });
    });

    this.sw.versionUpdates
      .pipe(
        filter((event): event is VersionEvent =>
          [
            'VERSION_DETECTED',
            'VERSION_READY',
            'VERSION_INSTALLATION_FAILED',
          ].includes(event.type)
        )
      )
      .subscribe({
        next: (event: VersionEvent) => this.handleVersionEvent(event),
        error: (error: Error) => {
          console.error('Error in version updates:', error);
          this.state.next({ status: 'error', error });
        },
      });
  }

  private handleVersionEvent(event: VersionEvent): void {
    switch (event.type) {
      case 'VERSION_DETECTED':
        console.log(`Downloading new app version: ${event.version.hash}`);
        this.state.next({ status: 'updating' });
        break;
      case 'VERSION_READY':
        console.log(
          `New app version ready for use: ${event.latestVersion.hash}`
        );
        this.state.next({ status: 'available' });
        this.showUpdateToast();
        break;
      case 'VERSION_INSTALLATION_FAILED':
        console.error(
          `Failed to install app version '${event.version.hash}':`,
          event.error
        );
        this.state.next({
          status: 'error',
          error: new Error(event.error),
        });
        break;
    }
  }

  private showUpdateToast(): void {
    toast('A new version is available', {
      description: 'Click to update and reload the app',
      duration: 10000,
      action: {
        label: 'Update',
        onClick: () => this.updateApplication(),
      },
    });
  }

  private async nukeServiceWorker(): Promise<void> {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((reg) => reg.unregister()));
      await this.clearCaches();
      console.log('Service worker nuked and caches cleared');
    }
  }

  updateApplication(): Promise<boolean> {
    // execute in sequence
    return this.clearCaches()
      .then(() => this.sw.activateUpdate())
      .then(() => {
        document.location.reload();
        return true;
      })
      .catch(async (error) => {
        console.error('Failed to activate update:', error);
        this.state.next({ status: 'error', error });
        if (error.toString().includes('Hash mismatch')) {
          await this.nukeServiceWorker();
        }
        return false;
      });
  }

  async clearCaches(): Promise<void> {
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((cacheName) => caches.delete(cacheName))
      );
      console.log('All caches cleared');
    }
  }
}

@Component({
  selector: 'pwa-update-status',
  standalone: true,
  imports: [CommonModule, HlmIconComponent],
  providers: [
    provideIcons({
      lucideRefreshCw,
      lucideCheck,
      lucideDownload,
      lucideTriangleAlert,
    }),
  ],
  template: `
    <div class="flex items-center justify-center text-xs text-muted-foreground">
      @switch (status()) { @case ('not_available') {
      <hlm-icon name="lucideCheck" class="text-green-500" size="16" />
      <span class="ml-1">App is up to date</span>
      } @case ('updating') {
      <hlm-icon
        name="lucideRefreshCw"
        class="text-blue-400 animate-spin"
        size="16"
      />
      <span class="ml-1">Updating app...</span>
      } @case ('available') {
      <hlm-icon name="lucideDownload" class="text-yellow-500" size="16" />
      <span class="ml-1">Update available</span>
      } @case ('error') {
      <hlm-icon name="lucideTriangleAlert" class="text-red-500" size="16" />
      <span class="ml-1">App update error</span>
      } }
    </div>
    @if (error()) {
    <div class="mt-1 text-xs text-center text-red-500">
      {{ error() }}
    </div>
    }
    <br />
    <br />
    <br />
    test updated version 11
  `,
})
export class PwaUpdateStatusComponent {
  pwa = inject(PwaUpdateRef);

  state = toSignal(this.pwa.state, {
    initialValue: { status: 'not_available', error: undefined },
  });

  status = computed(() => this.state().status);

  error = computed(() => this.state()?.error?.message ?? null);
}
