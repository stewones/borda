import { Route } from '@angular/router';

export const AppRoutes: Route[] = [
  {
    path: '',
    canActivate: [],
    loadComponent: () =>
      import('./pages/HomePageComponent').then((m) => m.HomePageComponent),
  },
  {
    path: 'overview',
    canActivate: [],
    loadComponent: () =>
      import('./pages/OverviewPageComponent').then(
        (m) => m.OverviewPageComponent
      ),
  },
  {
    path: 'offline',
    canActivate: [],
    loadComponent: () =>
      import('./pages/OfflinePageComponent').then(
        (m) => m.OfflinePageComponent
      ),
  },
];
