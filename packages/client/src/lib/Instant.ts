/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Dexie, Table } from 'dexie';
import { singular } from 'pluralize';
import { z } from 'zod';

import { fetcher } from './';

type SchemaField = z.ZodTypeAny;

export interface iQLByDirective {
  $by: string;
}

export interface iQL<T, TKey, TInsertType> {
  [key: string]:
    | iQL<T, TKey, TInsertType>
    | Table<T, TKey, TInsertType>
    | iQLByDirective;
}

export interface InstantSyncResponse {
  collection: string;
  objectId: string;
  status: 'created' | 'updated' | 'deleted';
  value: unknown;
  expiresAt: string;
  error?: unknown;
  terminated?: boolean;
}

export const objectId = <T extends string>(p: T) =>
  z.string().max(9).brand<T>();

export const objectPointer = <T extends string>(p: T) =>
  z
    .object({ collection: z.string().max(42), objectId: z.string().max(9) })
    .brand<T>();

/**
 * The returned string is a representation of the pointer
 * which identifies the collection and the objectId
 *
 * @example
 * const userId = pointerRef('users', 'a1b2c3');
 * // userId => 'users$a1b2c3'
 *
 * @param p - pointer
 * @param objectId - objectId
 * @returns string
 */
export const pointerRef = <T = typeof objectPointer>(
  collection: string,
  objectId: string
) => `${collection}$${objectId}` as T;

export class Instant {
  #db!: Dexie;
  #name: string;
  #serverURL: string;
  #schema: Record<string, z.ZodObject<Record<string, SchemaField>>>;
  #inspect: boolean;

  get db() {
    if (!this.#db) {
      throw new Error(
        'Database not initialized. Try awaiting `ready()` first.'
      );
    }
    return this.#db;
  }

  constructor({
    // @todo for isolated tests
    // db,
    // idb,
    // idbKeyRange,
    schema,
    name,
    serverURL,
    inspect,
  }: {
    // @todo for isolated tests
    // db?: Dexie;
    // idb?: typeof indexedDB;
    // idbKeyRange?: typeof IDBKeyRange;
    name: Capitalize<string>;
    schema: Record<string, z.ZodObject<any>>;
    serverURL?: string | undefined;
    inspect?: boolean | undefined;
  }) {
    this.#name = name;
    this.#schema = schema;
    this.#serverURL = serverURL || '';
    this.#inspect = inspect || false;
  }

  /**
   * The ready method is required in order to interact with the database.
   * It will generate a new Dexie schema based on the zod schema
   * and initialize the local database instance.
   *
   * @returns Promise<void>
   */
  async ready() {
    try {
      // generate a new Dexie schema from the zod schema
      const dexieSchema: Record<string, string> = {};

      for (const tableName in this.#schema) {
        dexieSchema[tableName] = `${Object.keys(
          this.#schema[tableName].shape
        ).join(', ')}`;
      }

      const db = new Dexie(this.#name, {
        // @todo for isolated tests
        // indexedDB: idb,
        // IDBKeyRange: idbKeyRange,
      });

      db.version(1).stores(dexieSchema);
      this.#db = db;

      this.#db.on('ready', (db) => {
        Promise.resolve(db);
      });
    } catch (error) {
      console.error('Error initializing database', error);
      Promise.reject(error);
    }
  }

  async sync() {
    if (!this.#db) {
      throw new Error(
        'Database not initialized. Try awaiting `ready()` first.'
      );
    }

    if (!this.#serverURL) {
      throw new Error('Server URL is required to sync');
    }

    await this.#syncLive();
    await this.#syncBatch();
  }

  async #syncLive() {
    const url = `${this.#serverURL}/instant/sync/live`;
    const eventSource = new EventSource(url);

    eventSource.onopen = () => {
      if (this.#inspect) {
        console.log('SSE connection opened');
      }
    };

    eventSource.onerror = (error: any) => {
      if (this.#inspect) {
        console.error('SSE error:', error);
      }
    };

    const listener = (eventSource.onmessage = async ({
      data,
    }: {
      data: string;
    }) => {
      const eventData = JSON.parse(data) as InstantSyncResponse;
      const { error, terminated } = eventData;

      // close
      if (terminated) {
        console.error('SSE connection terminated', error);
        eventSource.removeEventListener('message', listener);
        eventSource.close();
        return;
      }

      if (error) {
        console.error('SSE message error', error);
        return;
      }

      // process message
      if (this.#inspect) {
        console.log('SSE message', eventData);
      }

      await this.#syncProcess(eventData);
    });
  }

  async #syncBatch() {
    const url = `${this.#serverURL}/instant/sync/batch`;
    const collections = Object.keys(this.#schema);

    const response = await fetcher<InstantSyncResponse[]>(url, {
      direct: true,
      method: 'POST',
      // @todo add headers
      body: {
        collections,
        lastSyncAt: null,
      },
    });

    for (const update of response) {
      await this.#syncProcess(update);
    }
  }

  async #syncProcess({
    collection,
    objectId,
    status,
    value,
  }: Pick<
    InstantSyncResponse,
    'collection' | 'objectId' | 'status' | 'value'
  >) {
    switch (status) {
      case 'created':
        await this.#db.table(collection).add(value);
        break;
      case 'updated':
        console.log('updated', objectId, value);
        await this.#db.table(collection).update(objectId, value as object);
        break;
      case 'deleted':
        await this.#db.table(collection).delete(objectId);
        break;
    }
  }

  async query<T, TKey, TInsertType>(iql: iQL<T, TKey, TInsertType>) {
    // ... existing code ...
    const getPointerField = (
      childTable: string,
      parentTable: string
    ): string | undefined => {
      const childSchema = this.#schema[childTable];
      if (!childSchema) return undefined;

      for (const [fieldName, fieldSchema] of Object.entries(
        childSchema.shape
      )) {
        if (
          fieldSchema instanceof z.ZodBranded &&
          fieldSchema._def.type instanceof z.ZodObject
        ) {
          const innerShape = fieldSchema._def.type.shape;
          if (
            innerShape.collection instanceof z.ZodLiteral &&
            innerShape.collection._def.value === parentTable
          ) {
            return fieldName;
          }
        }
      }

      return undefined;
    };

    const executeQuery = async (
      queryObject: iQL<T, TKey, TInsertType>,
      parentTable?: string,
      parentId?: string
    ) => {
      const result: Record<string, T[]> = {};

      for (const tableName in queryObject) {
        if (Object.prototype.hasOwnProperty.call(queryObject, tableName)) {
          const tableQuery = queryObject[tableName];
          let tableData;

          const parentTableAsBy = parentTable
            ? singular(parentTable)
            : undefined;

          if (parentTable && parentId) {
            const pointerField = getPointerField(tableName, parentTable);

            if (pointerField) {
              tableData = await this.#db
                .table(tableName)
                .where(pointerField)
                .equals(pointerRef(parentTable, parentId))
                .toArray();
            } else if (parentTableAsBy) {
              // console.log('table', tableName);
              // console.log('where', parentTableAsBy);
              // console.log('equals', pointerRef(parentTable, parentId));
              tableData =
                (await this.#db
                  .table(tableName)
                  .where(parentTableAsBy)
                  .equals(pointerRef(parentTable, parentId))
                  .toArray()
                  .catch((err) => console.log(err))) || [];
            } else {
              tableData = [];
            }
          } else {
            tableData = await this.#db
              .table(tableName)
              .orderBy('_created_at')
              .reverse()
              .toArray();
          }

          if (Object.keys(tableQuery).length === 0) {
            result[tableName] = tableData;
          } else if ((tableQuery as iQLByDirective).$by) {
            // Handle $by directive
            const byField = (tableQuery as iQLByDirective).$by;

            const nestedData = await this.#db
              .table(tableName)
              .where(byField)
              .equals(pointerRef(parentTable!, parentId!))
              .toArray();

            result[tableName] = nestedData;
          } else {
            result[tableName] = await Promise.all(
              tableData.map(async (item) => {
                const nestedResult = await executeQuery(
                  tableQuery as iQL<T, TKey, TInsertType>,
                  tableName,
                  item._id
                );
                return { ...item, ...nestedResult };
              })
            );
          }
        }
      }

      return result;
    };

    return executeQuery(iql);
  }
}
