import { Route } from '@angular/router';

export const AppRoutes: Route[] = [
  {
    path: '',
    canActivate: [],
    loadComponent: () =>
      import('./pages/HomePageComponent').then((m) => m.HomePageComponent),
  },
  {
    path: 'old',
    canActivate: [],
    loadComponent: () =>
      import('./pages/OldPageComponent').then((m) => m.OldPageComponent),
  },
  {
    path: 'users',
    canActivate: [],
    loadComponent: () =>
      import('./pages/UsersPageComponent').then((m) => m.UsersPageComponent),
  },
];
