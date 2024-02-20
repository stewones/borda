/**
 * @license
 * Copyright Borda All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://borda.dev/license
 */

import * as bcrypt from 'bcryptjs';
import PasswordValidator from 'password-validator';

/**
 * Returns a promise for a hashed password string
 */
export function hash(password: string) {
  return bcrypt.hash(password, 10);
}

/**
 * Returns a promise for whether this password compares to equal this hashed password
 */
export async function compare(password: string, hashedPassword: string) {
  // Cannot bcrypt compare when one is undefined
  if (!password || !hashedPassword) {
    return Promise.resolve(false);
  }
  return bcrypt.compare(password, hashedPassword);
}

/**
 * Password validation
 */
export async function validate(
  password: string,
  options?: {
    list?: boolean;
    details?: boolean;
  }
) {
  const schema = new PasswordValidator();
  schema
    .has()
    .symbols(1, 'Password should have at least one symbol')
    .is()
    .min(8, 'Password must have a minimum length of 8 chars')
    .is()
    .max(64, 'Password must have a maximum length of 64 chars')
    .has()
    .uppercase(undefined, 'Password should have uppercase letters')
    .has()
    .lowercase(undefined, 'Password should have lowercase letters')
    .has()
    .digits(2, 'Password must have at least 2 digits')
    .has()
    .not()
    .spaces(undefined, 'Password must not have spaces')
    .is()
    .not()
    .oneOf(['Passw0rd', 'Password123']); // Blacklist these values (can be expanded to a setting in the future)
  return schema.validate(password, options);
}
