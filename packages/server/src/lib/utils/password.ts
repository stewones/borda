// Tools for encrypting and decrypting passwords.
// Basically promise-friendly wrappers for bcrypt.
import bcrypt from '@node-rs/bcrypt';

// Returns a promise for a hashed password string.
export function hash(password: string) {
  return bcrypt.hash(password, 10);
}

// Returns a promise for whether this password compares to equal this
// hashed password.
export async function compare(password: string, hashedPassword: string) {
  // Cannot bcrypt compare when one is undefined
  if (!password || !hashedPassword) {
    return Promise.resolve(false);
  }
  return bcrypt.compare(password, hashedPassword);
}
