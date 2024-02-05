import { Db } from 'mongodb';

import { BordaQuery, Document, DocumentQuery } from '@borda/client';

import { Cache } from './Cache';
import { Cloud } from './Cloud';
import {
  aggregate,
  count,
  del,
  find,
  get,
  insert,
  insertMany,
  put,
  remove,
  removeMany,
  update,
  updateMany,
  upsert,
  upsertMany,
} from './operation';
import { DocQRLFrom, parseQuery } from './parse';

export class BordaServerQuery<
  TSchema extends Document = Document
> extends BordaQuery {
  #db!: Db;
  #cache!: Cache;
  #cloud!: Cloud;

  constructor({
    inspect,
    collection,
    db,
    cache,
    cloud,
  }: {
    collection: string;
    inspect?: boolean;
    db: Db;
    cache: Cache;
    cloud: Cloud;
  }) {
    super({
      inspect,
      collection,
    });

    this.#db = db;
    this.#cache = cache;
    this.#cloud = cloud;
  }

  load(collectionName: string) {
    return new BordaServerQuery({
      collection: collectionName,
      inspect: this.inspect,
      db: this.#db,
      cache: this.#cache,
      cloud: this.#cloud,
    });
  }

  public override bridge({ method, objectId, ...rest }: DocumentQuery) {
    const docQRLFrom: DocQRLFrom = {
      ...rest,
      method,
      collection: this.collection,
    };

    const docQRL = parseQuery({
      from: docQRLFrom,
      db: this.#db,
      inspect: this.inspect ?? false,
    });

    if (['get'].includes(method)) {
      return get({
        docQRL,
        objectId: objectId || '',
        inspect: this.inspect,
        unlocked: true,
        cache: this.#cache,
        query: (collectionName: string) => this.load(collectionName),
      });
    }

    if (['put'].includes(method)) {
      return put({
        docQRL,
        objectId: objectId || '',
        inspect: this.inspect,
        cache: this.#cache,
        unlocked: true,
        cloud: this.#cloud,
      });
    }

    if (['find', 'findOne'].includes(method)) {
      return find<TSchema>({
        docQRL,
        method,
        inspect: this.inspect,
        unlocked: true,
        cache: this.#cache,
        query: (collectionName: string) => this.load(collectionName),
      });
    }

    if (method === 'insert') {
      return insert({
        docQRL,
        inspect: this.inspect,
        unlocked: true,
        cloud: this.#cloud,
      });
    }

    if (method === 'insertMany') {
      return insertMany({
        docQRL,
        inspect: this.inspect,
        unlocked: true,
        cloud: this.#cloud,
      });
    }

    if (method === 'delete') {
      return del({
        docQRL,
        objectId: objectId || '',
        inspect: this.inspect,
        cache: this.#cache,
        unlocked: true,
        cloud: this.#cloud,
      });
    }

    if (method === 'remove') {
      return remove({
        docQRL,
        inspect: this.inspect,
        cache: this.#cache,
        unlocked: true,
        cloud: this.#cloud,
      });
    }

    if (method === 'removeMany') {
      return removeMany({
        docQRL,
        inspect: this.inspect,
        cache: this.#cache,
        unlocked: true,
        cloud: this.#cloud,
      });
    }

    if (method === 'aggregate') {
      return aggregate({
        docQRL,
        inspect: this.inspect,
        cache: this.#cache,
        query: (collectionName: string) => this.load(collectionName),
        unlocked: true,
      });
    }

    if (method === 'count') {
      return count({
        docQRL,
        inspect: this.inspect,
      });
    }

    if (method === 'update') {
      return update({
        docQRL,
        inspect: this.inspect,
        cache: this.#cache,
        unlocked: true,
        cloud: this.#cloud,
      });
    }

    if (method === 'updateMany') {
      return updateMany({
        docQRL,
        inspect: this.inspect,
        cache: this.#cache,
        unlocked: true,
      });
    }

    if (method === 'upsert') {
      return upsert({
        docQRL,
        inspect: this.inspect,
        cache: this.#cache,
        unlocked: true,
      });
    }

    if (method === 'upsertMany') {
      return upsertMany({
        docQRL,
        inspect: this.inspect,
        cache: this.#cache,
        unlocked: true,
      });
    }

    return Promise.reject(`method ${method} not implemented`);
  }
}
