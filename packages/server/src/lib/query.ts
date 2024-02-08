import { Db } from 'mongodb';
import { finalize, first, Observable } from 'rxjs';

import {
  BordaQuery,
  Document,
  DocumentLiveQuery,
  DocumentQuery,
  LiveQueryMessage,
} from '@borda/client';

import { Cache } from './Cache';
import { Cloud } from './Cloud';
import { handleOn, handleOnce } from './livequery';
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
> extends BordaQuery<TSchema> {
  #db!: Db;
  #cache!: Cache;
  #cloud!: Cloud;
  #queryLimit!: number;

  constructor({
    inspect,
    collection,
    db,
    cache,
    cloud,
    queryLimit,
  }: {
    collection: string;
    inspect?: boolean;
    db: Db;
    cache: Cache;
    cloud: Cloud;
    queryLimit: number;
  }) {
    super({
      inspect,
      collection,
    });

    this.#db = db;
    this.#cache = cache;
    this.#cloud = cloud;
    this.#queryLimit = queryLimit;
  }

  load(collectionName: string) {
    return new BordaServerQuery({
      collection: collectionName,
      inspect: this.inspect,
      db: this.#db,
      cache: this.#cache,
      cloud: this.#cloud,
      queryLimit: this.#queryLimit,
    });
  }

  public override get bridge() {
    return {
      run: ({ method, objectId, ...rest }: DocumentQuery<TSchema>) => {
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
            queryLimit: this.#queryLimit,
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
      },
      on: ({ collection, event, ...rest }: DocumentLiveQuery<TSchema>) => {
        const { disconnect, onChanges, onError } = handleOn<TSchema>({
          collection,
          event,
          ...rest,
          db: this.#db,
          unlocked: true,
          cache: this.#cache,
          query: (collectionName: string) => this.load(collectionName),
          inspect: this.inspect ?? false,
        });
        const source = new Observable<LiveQueryMessage<TSchema>>((observer) => {
          onChanges.subscribe((data) => observer.next(data));
          onError.subscribe((error) => {
            observer.error(error);
            disconnect();
          });
        }).pipe(
          finalize(() => {
            disconnect();
          })
        );
        return source;
      },
      once: ({ collection, event, ...rest }: DocumentLiveQuery<TSchema>) =>
        new Observable<LiveQueryMessage<TSchema>>((observer) => {
          handleOnce<TSchema>({
            collection,
            event,
            ...rest,
            db: this.#db,
            unlocked: true,
            cache: this.#cache,
            query: (collectionName: string) => this.load(collectionName),
            inspect: this.inspect ?? false,
          })
            .then((data) => observer.next(data))
            .catch((error) => observer.error(error));
        }).pipe(first()),
    };
  }
}
