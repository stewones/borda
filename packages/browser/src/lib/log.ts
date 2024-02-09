/**
 * @license
 * Copyright Borda All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://borda.dev/license
 */

import { BordaBrowser } from './Browser';

export const log = (...args: unknown[]) =>
  BordaBrowser.params.debug ? console.log(...args) : undefined;
