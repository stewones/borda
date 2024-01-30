import { Elysia, ElysiaConfig } from 'elysia';
import { Db } from 'mongodb';
import { Subject } from 'rxjs';

import { BordaHeaders } from './internal';
import { mongoConnect, mongoCreateIndexes } from './mongodb';
import { createServer } from './rest';

export interface BordaParams {
  name?: string;
  inspect?: boolean;

  mongoURI?: string;

  serverKey?: string;
  serverSecret?: string;
  serverURL?: string;
  serverHeaderPrefix?: string;
  serverPoweredBy?: string;

  /**
   * Default to 1h for document time-to-live.
   * it means that some internal queries will hit memory and be invalidated on every hour.
   * _unless_ related docs are updated/deleted in the database, in this case cache is invalidated right away.
   */
  cacheTTL?: number;
  /**
   * when the `query.limit(...)` is not set, this setting will be applied.
   * to deactivate this setting, just set `query.unlock()` in your query
   * please note that unlocking queries is only available in the server-side.
   *
   * Default to 50 docs per query
   */
  queryLimit?: number;

  // plugins?: ElegantePlugin[];
  // liveQueryServerURL?: string;
}

export class Borda {
  #name!: string;
  #inspect!: boolean;
  #mongoURI!: string;
  #serverKey!: string;
  #serverSecret!: string;
  #serverURL!: string;
  #serverHeaderPrefix!: string;
  #serverPoweredBy!: string;
  #cacheTTL!: number;
  #queryLimit!: number;

  #server!: Elysia;
  #db!: Db;

  public static onDatabaseConnect = new Subject<{
    db: Db;
    name: string;
  }>();

  get db() {
    return this.#db;
  }

  get name() {
    return this.#name;
  }

  get inspect() {
    return this.#inspect;
  }

  get mongoURI() {
    return this.#mongoURI;
  }

  get serverKey() {
    return this.#serverKey;
  }

  get serverSecret() {
    return this.#serverSecret;
  }

  get serverURL() {
    return this.#serverURL;
  }

  get serverHeaderPrefix() {
    return this.#serverHeaderPrefix;
  }

  get serverPoweredBy() {
    return this.#serverPoweredBy;
  }

  get cacheTTL() {
    return this.#cacheTTL;
  }

  get queryLimit() {
    return this.#queryLimit;
  }

  get app() {
    return this.#server;
  }

  constructor({
    params,
    config,
  }: {
    params?: Partial<BordaParams>;
    config?: Partial<ElysiaConfig>;
  } = {}) {
    const {
      name,
      inspect,
      mongoURI,
      serverKey,
      serverSecret,
      serverURL,
      serverHeaderPrefix,
      serverPoweredBy,
      cacheTTL,
      queryLimit,
    } = params || {};

    // set default params
    this.#inspect = inspect || false;
    this.#name = name || 'default';
    this.#mongoURI =
      mongoURI ||
      process.env['BORDA_MONGO_URI'] ||
      'mongodb://127.0.0.1:27017/borda-dev';
    this.#serverKey =
      serverKey || process.env['BORDA_SERVER_KEY'] || 'b-o-r-d-a';
    this.#serverSecret =
      serverSecret || process.env['BORDA_SERVER_SECRET'] || 's-e-c-r-e-t';
    this.#serverURL =
      serverURL || process.env['BORDA_SERVER_URL'] || 'http://127.0.0.1:1337';
    this.#serverHeaderPrefix =
      serverHeaderPrefix ||
      process.env['BORDA_SERVER_HEADER_PREFIX'] ||
      'X-Borda';
    this.#serverPoweredBy =
      serverPoweredBy || process.env['BORDA_SERVER_POWERED_BY'] || 'Borda';
    this.#cacheTTL =
      cacheTTL ||
      parseFloat(process.env['BORDA_CACHE_TTL'] ?? '0') ||
      1 * 1000 * 60 * 60;
    this.#queryLimit = queryLimit || 50;

    // instantiate the server
    this.#server = createServer({
      config,
      serverHeaderPrefix: this.#serverHeaderPrefix,
      serverKey: this.#serverKey,
      name: this.#name,
      poweredBy: this.#serverPoweredBy,
    });
  }

  public static print(...args: unknown[]) {
    console.log('\x1b[36m%s\x1b[0m', ...args); // Cyan color
  }

  log(...args: unknown[]) {
    if (this.#inspect) {
      Borda.print(...args);
    }
  }

  ping() {
    return fetch(`${this.#serverURL}/ping`, {
      headers: {
        'Content-Type': 'text/html',
        [`${this.#serverHeaderPrefix}-${BordaHeaders['apiKey']}`]:
          this.#serverKey,
      },
    });
  }

  async server() {
    this.#db = await mongoConnect({ mongoURI: this.#mongoURI });
    await mongoCreateIndexes({ db: this.#db });
    Borda.onDatabaseConnect.next({
      db: this.#db,
      name: this.#name,
    });
    return this.#server;
  }
}
