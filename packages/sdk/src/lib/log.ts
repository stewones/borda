/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

import { EleganteClient } from './Client';

export const print = (...args: unknown[]) =>
  console.debug('\x1b[33m%s\x1b[0m', ...args);

export const log = (...args: unknown[]) =>
  EleganteClient.params.debug ? print(...args) : undefined;
