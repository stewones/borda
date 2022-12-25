/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

import { Record } from './record';
import { User } from './user';

export interface Session extends Record {
  user: User;
  token: string;
}
