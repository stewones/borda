/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

import { print } from '@elegante/sdk';
import { EleganteBrowser } from './Browser';

export const log = (...args: unknown[]) =>
  EleganteBrowser.debug ? print(...args) : undefined;
