/**
 * @license
 * Copyright Borda All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://borda.dev/license
 */

import { Record } from './record';

export interface User extends Record {
  name: string;
  email: string;
  password?: string; // we don't expose this
}
