import { Document } from '../types';
import { cloneDeep } from './cloneDeep';

export class IndexedDB {
  #db!: IDBDatabase;

  #dbVersion;
  #dbName!: string;
  #dbStore!: string;

  #dbOpenError = new Error('Borda database not open');

  constructor({
    name,
    store,
    version,
  }: {
    name: string;
    store: string;
    version: number;
  }) {
    this.#dbName = name;
    this.#dbVersion = version;
    this.#dbStore = store;
  }

  /**
   * mandatory to call before any other method
   * and must be awaited
   */
  async load() {
    await this.#open();
    return this;
  }

  #open() {
    const DBOpenRequest = indexedDB.open(this.#dbName, this.#dbVersion);
    return new Promise<IDBDatabase>((resolve, reject) => {
      DBOpenRequest.onsuccess = () => {
        this.#db = DBOpenRequest.result;
        return resolve(this.#db);
      };
      DBOpenRequest.onerror = () => {
        return reject(DBOpenRequest.error);
      };
      DBOpenRequest.onupgradeneeded = (event: any) => {
        this.#db = event.target.result;
        this.#db.createObjectStore(this.#dbStore);
      };
    });
  }

  get<T = Document>(key: string): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.#db) return reject(this.#dbOpenError);

      const transaction = this.#db.transaction([this.#dbStore], 'readonly');
      const store = transaction.objectStore(this.#dbStore);

      const request = store.get(key);

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  set<T = Document>(key: string, value: T): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.#db) return reject(this.#dbOpenError);

      const transaction = this.#db.transaction([this.#dbStore], 'readwrite');
      const store = transaction.objectStore(this.#dbStore);

      const request = store.put(cloneDeep(value), key);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  unset(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.#db) return reject(this.#dbOpenError);

      const transaction = this.#db.transaction([this.#dbStore], 'readwrite');
      const store = transaction.objectStore(this.#dbStore);
      const request = store.delete(key);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  clear(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.#db) return reject(this.#dbOpenError);

      const transaction = this.#db.transaction([this.#dbStore], 'readwrite');
      const store = transaction.objectStore(this.#dbStore);
      const request = store.clear();

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }
}
