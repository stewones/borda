/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { getPluginHook } from './Plugin';
import { pointer } from './pointer';
import { query } from './query';
import {
  AggregateOptions,
  DocumentFilter,
  Filter,
  FindOptions,
  Query,
  Record,
  Sort,
} from './types';
import { cloneDeep, isEmpty, isServer, unset } from './utils';

export type ActiveModel<T> = Partial<T> | string;
export interface ActiveParams<T = any> {
  /**
   * define a default filter for the query (same as MongoDB's)
   */
  filter?: DocumentFilter<T>;

  /**
   * define a default sort for the query. (Same as MongoDB's)
   */
  sort?: Sort;

  /**
   * define a default projection for the query. (Same as MongoDB's)
   */
  projection?: {
    [key in keyof T]: number;
  };

  /**
   * define default options for the Find ang Aggregate operations
   */
  options?: FindOptions | AggregateOptions | undefined;

  /**
   * define a default MongoDB aggregation pipeline
   */
  pipeline?: { [key in keyof T]: Filter<T> }[];

  /**
   * similiar to MySQL's join
   * This will allow you to join other collections
   * just by passing a list of pointer names
   * it accepts nested pointers ie: ['user.profile.photo']
   */
  include?: string[];

  /**
   * define props to be excluded from the query results
   * it accepts nested pointers ie: ['user.profile.createdAt']
   */
  exclude?: string[];

  /**
   * this is a shortcut to multiple "wheres" at same time
   *
   * @example
   * new UserModel({
   *   name: 'John',
   *   email: 'john@doe.com'
   * }, {
   *   by: ['name', 'email']
   * })
   * .fetch()
   *
   * will generate the following query:
   *
   * {
   *  // ...
   *  filter: {
   *    name: 'John',
   *    email: 'john@doe.com'
   *  }
   * }
   */
  by?: string[];

  /**
   * pass any data context to the server triggers
   */
  context?: any;

  /**
   * whether or not to exclude expired documents by default
   */
  excludeExpiredDocs?: boolean;

  /**
   * inspect queries in the server
   */
  inspect?: boolean;

  /**
   * operations
   */
  insert?: {
    updatedAt?: boolean;
  };
}

export class ActiveRecord<Doc extends Record> {
  private params: ActiveParams<Doc> = {} as ActiveParams<Doc>;
  private collection: string;
  private doc: Doc = {} as Doc;
  private query!: Query<Doc>;
  private hit!: boolean;
  private objectId!: string;

  constructor(
    collection: string,
    record?: ActiveModel<Doc>,
    params: ActiveParams<Doc> = {}
  ) {
    this.collection = collection;

    let filter: any = params.filter ?? {};

    /**
     * here we force to not include expired documents by default
     * but it can be disabled with the option `excludeExpiredDocs`
     */
    if (params.excludeExpiredDocs !== false && !filter.expiresAt) {
      filter['expiresAt'] = {
        $exists: false,
      };
    }

    if (typeof record === 'string') {
      this.objectId = record;
      filter['objectId'] = record;
      this.query = query<Doc>(this.collection)
        .unlock(isServer())
        .filter(filter)
        .include(params.include ?? [])
        .exclude(params.exclude ?? [])
        .projection(params.projection ?? ({} as any));
    } else if (typeof record === 'object') {
      Object.assign(this.doc, record);

      if (record['objectId']) {
        this.objectId = record['objectId'];
        filter['objectId'] = {
          $eq: this.objectId,
        };
      }

      if (params.by) {
        for (const key of params.by) {
          type k = keyof typeof this.doc;
          if (this.doc[key as k]) {
            filter = {
              ...filter,
              [key]: {
                $eq: this.doc[key as k],
              },
            };
          }
        }
      }

      this.query = query<Doc>(this.collection)
        .unlock(isServer())
        .include(params.include ?? [])
        .exclude(params.exclude ?? [])
        .projection(params.projection ?? ({} as any))
        .pipeline(params.pipeline ?? ([] as any))
        .sort(params.sort ?? {})
        .filter(filter);
    }

    this.params = { ...params, filter };
  }

  public get<K extends keyof Doc>(key: K): Doc[K] {
    return this.onDocumentRead(this.doc)[key];
  }

  public set<K extends keyof Doc>(key: keyof Doc, value: Doc[K]) {
    this.doc[key] = value;
  }

  public unset(key: string) {
    unset(this.doc, key);
  }

  public exists() {
    return this.hit;
  }

  public getRawValue() {
    return this.onDocumentRead(this.doc);
  }

  public async fetch() {
    return this.query
      .findOne({
        context: this.params.context,
        inspect: this.params.inspect,
      })
      .then((doc) => {
        Object.assign(this.doc, doc);

        if (isEmpty(doc)) {
          this.hit = false;
        } else {
          this.hit = true;
          this.objectId = doc.objectId;
        }

        return doc;
      });
  }

  public async save(): Promise<Doc> {
    if (this.objectId) {
      return this.query
        .update(this.objectId, await this.beforeDocumentSave(this.doc), {
          context: this.params.context,
          inspect: this.params.inspect,
        })
        .then(() => this.getRawValue());
    } else {
      if (!isEmpty(this.params.by)) {
        const doc = cloneDeep(this.doc);
        await this.fetch();
        if (this.hit) {
          this.doc = { ...this.doc, ...doc };
          return this.query
            .update(this.objectId, await this.beforeDocumentSave(this.doc), {
              context: this.params.context,
              inspect: this.params.inspect,
            })
            .then(() => this.getRawValue());
        }
      }

      return this.query
        .insert(await this.beforeDocumentSave(this.doc), {
          context: this.params.context,
          inspect: this.params.inspect,
          insert: this.params.insert ?? {},
        })
        .then((doc) => {
          this.doc = doc;
          this.objectId = doc.objectId;
          return this.getRawValue();
        });
    }
  }

  public delete() {
    if (!this.objectId) {
      throw new Error('objectId is required to delete a record');
    }
    return this.query.delete(this.objectId, {
      context: this.params.context,
      inspect: this.params.inspect,
    });
  }

  public pointer<T = Doc>() {
    return pointer<T>(this.collection, this.objectId);
  }

  private async beforeDocumentSave(obj: Doc & any) {
    if (isServer()) {
      // we need to remove updatedAt from the document
      // otherwise server in unlock mode will never auto-update this field
      if (obj && obj.updatedAt) {
        delete obj.updatedAt;
      }
    }

    obj = this.parseDocBeforeSave(obj);

    const hook: any = getPluginHook('ActiveRecordBeforeDocumentSave');

    if (hook) {
      obj = await hook({ doc: obj, params: this.params });
    }

    return obj;
  }

  private onDocumentRead(obj: Doc) {
    const hook: any = getPluginHook('ActiveRecordOnDocumentRead');

    if (hook) {
      obj = hook({ doc: obj, params: this.params });
    }

    return obj;
  }

  private parseDocBeforeSave(obj: Doc) {
    const include = this.params.include ?? [];
    for (const field in obj) {
      include.forEach((inc) => {
        if (inc.startsWith(field) && typeof obj[field] === 'object') {
          delete obj[field];
        }
      });
    }
    return obj;
  }
}
