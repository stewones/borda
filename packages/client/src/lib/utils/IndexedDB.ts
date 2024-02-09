import { Document } from '../types';

export class IndexedDB {
  private static db: IDBDatabase;
  private static store: IDBObjectStore;
  private static dbVersion = 1;
  private static dbName = 'borda';
  private static dbStore = 'app';

  private static async open() {
    const DBOpenRequest = indexedDB.open(this.dbName, this.dbVersion);
    return new Promise<IDBDatabase>((resolve, reject) => {
      DBOpenRequest.onsuccess = () => {
        this.db = DBOpenRequest.result;
        return resolve(this.db);
      };
      DBOpenRequest.onerror = () => {
        return reject(DBOpenRequest.error);
      };
      DBOpenRequest.onupgradeneeded = (event: any) => {
        this.db = event.target.result;
        this.db.createObjectStore(this.dbStore);
      };
    });
  }

  public static async load(params: {
    name?: string;
    store?: string;
    version?: number;
  }) {
    const { name, version, store } = params;
    this.dbName = name ?? this.dbName;
    this.dbVersion = version ?? this.dbVersion;
    this.dbStore = store ?? this.dbStore;
    await this.open();
    return this;
  }

  public static async get<T = Document>(key: string): Promise<T> {
    if (!this.db) {
      throw new Error(
        'Database not initialized. Please call `IndexedDB.load()` on the app startup.'
      );
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.dbStore], 'readonly');
      const store = transaction.objectStore(this.dbStore);

      const request = store.get(key);

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  public static async set<T = Document>(key: string, value: T): Promise<void> {
    if (!this.db) {
      throw new Error(
        'Database not initialized. Please call `IndexedDB.load()` on the app startup.'
      );
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.dbStore], 'readwrite');
      const store = transaction.objectStore(this.dbStore);
      const request = store.put(value, key);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  public static async unset(key: string): Promise<void> {
    if (!this.db) {
      throw new Error(
        'Database not initialized. Please call `IndexedDB.load()` on the app startup.'
      );
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.dbStore], 'readwrite');
      const store = transaction.objectStore(this.dbStore);
      const request = store.delete(key);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  public static async clear(): Promise<void> {
    if (!this.db) {
      throw new Error(
        'Database not initialized. Please call `IndexedDB.load()` on the app startup.'
      );
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.dbStore], 'readwrite');
      const store = transaction.objectStore(this.dbStore);
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
