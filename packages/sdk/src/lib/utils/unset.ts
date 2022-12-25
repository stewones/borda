/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export function unset(obj: any, path: string) {
  // Regex explained: https://regexr.com/58j0k
  const pathArray: any = Array.isArray(path) ? path : path.match(/([^[.\]])+/g);

  pathArray.reduce((acc: any, key: string, i: number) => {
    if (i === pathArray.length - 1) delete acc[key];
    return acc[key];
  }, obj);
}
