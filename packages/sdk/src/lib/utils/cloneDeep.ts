/**
 * @license
 * Copyright Intenseloop LTD All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export function cloneDeep<T = any>(entity: any, cache = new WeakMap()): T {
  const referenceTypes = ['Array', 'Object', 'Map', 'Set', 'Date'];
  const entityType = Object.prototype.toString.call(entity);

  if (
    !new RegExp(referenceTypes.join('|')).test(entityType) ||
    entity instanceof WeakMap ||
    entity instanceof WeakSet
  )
    return entity;

  if (cache.has(entity)) {
    return cache.get(entity);
  }

  const c = new entity.constructor();

  if (entity instanceof Map) {
    entity.forEach((value, key) => c.set(cloneDeep(key), cloneDeep(value)));
  }

  if (entity instanceof Set) {
    entity.forEach((value) => c.add(cloneDeep(value)));
  }

  if (entity instanceof Date) {
    return new Date(entity) as T;
  }

  cache.set(entity, c);

  return Object.assign(
    c,
    ...Object.keys(entity).map((prop) => ({
      [prop]: cloneDeep(entity[prop], cache),
    }))
  );
}
