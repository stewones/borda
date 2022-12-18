/**
 * @license
 * Copyright Intenseloop LTD All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

import { InternalCollectionName, InternalFieldName } from './internal';
import { objectFlip } from './utils';

export const ExternalCollectionName = objectFlip(InternalCollectionName);
export const ExternalFieldName = objectFlip(InternalFieldName);
