/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  Dexie,
  Table,
} from 'dexie';
import { singular } from 'pluralize';
import { z } from 'zod';

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
  #db: Dexie;

  #schema: Record<string, z.ZodObject<Record<string, SchemaField>>>;
  #keyPath = '_id';

  get db() {
    return this.#db;
  }

  constructor({
    // db,
    schema,
    name,
  }: // idb,
  // idbKeyRange,
  {
    //db?: Dexie;
    name: Capitalize<string>;
    schema: Record<string, z.ZodObject<any>>;
    // idb?: typeof indexedDB;
    // idbKeyRange?: typeof IDBKeyRange;
  }) {
    this.#schema = schema;

    // generate a new Dexie schema from the zod schema
    const dexieSchema: Record<string, string> = {};

    for (const tableName in schema) {
      // ++id,
      dexieSchema[tableName] = `${Object.keys(schema[tableName].shape).join(
        ', '
      )}`;
    }

    const db = new Dexie(name, {
      // indexedDB: idb,
      // IDBKeyRange: idbKeyRange,
    });
    db.version(1).stores(dexieSchema);

    this.#db = db;
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
