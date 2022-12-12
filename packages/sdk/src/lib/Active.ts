/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  FilterOperations,
  FindOptions,
  Record,
  Document,
  Query,
} from './types';
import { isEmpty, isServer, unset } from './utils';
import { query } from './query';
import { pointer } from './pointer';
import { getPluginHook } from './Plugin';

export interface ActiveRecordParams<T = any> {
  filter?: FilterOperations<T>;
  projection?: Partial<{
    [key in keyof T]: number;
  }>;

  options?: FindOptions | undefined;

  pipeline?: Document[];
  include?: string[];
  exclude?: string[];

  identifiers?: string[];
  context?: any;

  [key: string]: any;
}

export class ActiveRecord<Doc extends Record> {
  private params: ActiveRecordParams<Doc>;
  private collection: string;
  private doc: Doc = {} as Doc;
  private query!: Query<Doc>;
  private hit!: boolean;
  private objectId!: string;

  constructor(
    collection: string,
    record?: Partial<Doc>,
    params?: ActiveRecordParams
  ) {
    this.collection = collection;
    this.params = params ?? ({} as ActiveRecordParams);

    let filter: FilterOperations<Doc> =
      this.params.filter ?? ({} as FilterOperations<Doc>);

    filter = {
      ...filter,
      expiresAt: {
        $exists: false,
      },
    };

    if (typeof record === 'string') {
      this.objectId = record;
      this.query = query<Doc>(this.collection)
        .unlock(isServer())
        .include(this.params.include ?? [])
        .exclude(this.params.exclude ?? [])
        .projection(this.params.projection ?? {});
    } else if (typeof record === 'object') {
      Object.assign(this.doc, record);

      if (record['objectId']) {
        this.objectId = record['objectId'];
        filter['objectId'] = {
          $eq: this.objectId,
        };
      } else if (this.params.identifiers) {
        for (const key of this.params.identifiers) {
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
        .include(this.params.include ?? [])
        .exclude(this.params.exclude ?? [])
        .projection(this.params.projection ?? {})
        .pipeline(this.params.pipeline ?? [])
        .filter(filter);
    }
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
    return this.query.findOne(this.objectId).then((doc) => {
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

  public async save() {
    if (this.objectId) {
      return this.query.update(
        this.objectId,
        await this.beforeDocumentSave(this.doc)
      );
    } else {
      return this.query
        .insert(await this.beforeDocumentSave(this.doc))
        .then((doc) => Object.assign(this.doc, doc));
    }
  }

  public delete() {
    if (!this.objectId) {
      throw new Error('objectId is required to delete a record');
    }
    return this.query.delete(this.objectId);
  }

  public pointer<T = Doc>() {
    return pointer<T>(this.collection, this.objectId);
  }

  private async beforeDocumentSave(obj: any) {
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
}
