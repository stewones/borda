/**
 * @license
 * Copyright Borda All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://borda.dev/license
 */

export const InternalHeaders: Record<string, string> = {
  apiSecret: 'Api-Secret',
  apiKey: 'Api-Key',
  apiMethod: 'Api-Method',
  apiToken: 'Api-Token',
  apiInspect: 'Api-Inspect',
  apiTimeZone: 'Api-TimeZone',
};

export const InternalCollectionName: Record<string, string> = {
  User: '_User',
  Session: '_Session',
  Password: '_Password',
  // Job: '_Job', // @todo
};

export const InternalFieldName: Record<string, string> = {
  objectId: '_id',
  createdAt: '_created_at',
  updatedAt: '_updated_at',
  expiresAt: '_expires_at',
  token: '_token',
  password: '_hashed_password',
};

/**
 * these fields can't be exposed as they are reserved for the system
 * sensitive fields are removed by default from responses
 * unless you explicitly ask for them via `query.unlock()`
 */
export const InternalSensitiveFields: string[] = [
  /**
   * borda fields
   */
  'password',
  '_expires_at',
  '_token',
  '_hashed_password',
];

export const memo: Map<string, any> = new Map(); // @todo remove