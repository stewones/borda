/**
 * @license
 * Copyright Borda All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://borda.dev/license
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export function isEqual(obj1: any, obj2: any) {
  const getType = (obj: any) => {
    return Object.prototype.toString.call(obj).slice(8, -1).toLowerCase();
  };

  const areArraysEqual = () => {
    // Check length
    if (obj1.length !== obj2.length) return false;

    // Check each item in the array
    for (let i = 0; i < obj1.length; i++) {
      if (!isEqual(obj1[i], obj2[i])) return false;
    }

    // If no errors, return true
    return true;
  };

  const areObjectsEqual = () => {
    if (Object.keys(obj1).length !== Object.keys(obj2).length) return false;

    // Check each item in the object
    for (const key in obj1) {
      if (Object.prototype.hasOwnProperty.call(obj1, key)) {
        if (!isEqual(obj1[key], obj2[key])) return false;
      }
    }

    // If no errors, return true
    return true;
  };

  const areFunctionsEqual = () => {
    return obj1.toString() === obj2.toString();
  };

  const arePrimativesEqual = () => {
    return obj1 === obj2;
  };

  // Get the object type
  const type = getType(obj1);

  // If the two items are not the same type, return false
  if (type !== getType(obj2)) return false;

  // Compare based on type
  if (type === 'array') return areArraysEqual();
  if (type === 'object') return areObjectsEqual();
  if (type === 'function') return areFunctionsEqual();
  return arePrimativesEqual();
}
