/* eslint-disable @typescript-eslint/no-explicit-any */
import { Elysia, ElysiaConfig } from 'elysia';
import { Db } from 'mongodb';
import { Subject } from 'rxjs';

import {
  Auth,
  Document,
  InternalCollectionName,
  InternalHeaders,
  Session,
  User,
} from '@borda/client';

import { Cache } from './Cache';
import { Cloud } from './Cloud';
import { mongoConnect, mongoCreateIndexes } from './mongodb';
import {
  BordaEmailPasswordResetTemplatePlugin,
  BordaEmailPlugin,
  PluginHook,
  ServerPlugin,
} from './plugin';
import { BordaServerQuery } from './query';
import { createServer } from './server';
import { Version } from './version';

export type BordaRequest = Request & { session: Session };

export interface BordaParams {
  name?: string;
  inspect?: boolean;

  serverKey?: string;
  serverSecret?: string;
  serverURL?: string;
  serverHeaderPrefix?: string;
  serverPoweredBy?: string;

  /**
   * Default to `mongodb://127.0.0.1:27017/borda-dev`
   */
  mongoURI?: string;

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
   * if you're using the exported instance of Borda server, there's no hard limit applied as it's unlocked by default.
   * in this case, always make sure to set a limit in your queries.
   *
   * Default to 50 docs per query
   */
  queryLimit?: number;

  /**
   * Borda plugins
   */
  plugins?: ServerPlugin[];

  /**
   * Elysia config
   */
  config?: Partial<ElysiaConfig>;

  /**
   * Collections allowances
   */
  reservedCollections?: string[];
  liveCollections?: string[];
}

export class Borda {
  #name!: string;
  #inspect!: boolean;

  #mongoURI!: string;
  #queryLimit!: number;
  #cacheTTL!: number;
  #config!: Partial<ElysiaConfig>;

  #serverKey!: string;
  #serverSecret!: string;
  #serverURL!: string;
  #serverHeaderPrefix!: string;
  #serverPoweredBy!: string;

  #server!: Elysia;
  #db!: Db;
  #cloud!: Cloud;
  #cache!: Cache;
  #plugins!: ServerPlugin[];
  #auth!: Auth;

  #reservedCollections!: string[];
  #liveCollections!: string[];

  public onReady = new Subject<{
    db: Db;
    name: string;
    server: Elysia;
    cloud: Cloud;
    cache: Cache;
  }>();

  get db() {
    return this.#db;
  }

  get cloud() {
    return this.#cloud;
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

  get config() {
    return this.#config;
  }

  get plugins() {
    return this.#plugins;
  }

  get auth() {
    return this.#auth;
  }

  constructor(params?: Partial<BordaParams>) {
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
      plugins,
      reservedCollections,
      liveCollections,
    } = params || {};
    let { config } = params || {};

    // set default params

    this.#inspect = inspect || false;
    this.#name = name || 'main-borda';
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
    this.#reservedCollections =
      reservedCollections || Object.values(InternalCollectionName);
    this.#liveCollections = liveCollections || [];

    if (!config) {
      config = {
        name: this.#name,
      };
    } else {
      config.name = this.#name;
    }

    this.#config = config;

    // instantiate plugins
    this.addPlugins(plugins || []);

    // instantiate cloud
    this.#cloud = new Cloud();
  }

  ping() {
    return fetch(`${this.#serverURL}/ping`, {
      headers: {
        'Content-Type': 'text/html',
        [`${this.#serverHeaderPrefix}-${InternalHeaders['apiKey']}`]:
          this.#serverKey,
      },
    }).then((res) => res.text());
  }

  async server() {
    // instantiate auth
    this.#auth = new Auth({
      serverKey: this.#serverKey,
      serverSecret: this.#serverSecret,
      serverURL: this.#serverURL,
      serverHeaderPrefix: this.#serverHeaderPrefix,
    });

    // instantiate the cache
    this.#cache = new Cache({
      inspect: this.#inspect,
      cacheTTL: this.#cacheTTL,
    });

    // connect to mongodb and create indexes
    this.#db = await mongoConnect({ mongoURI: this.#mongoURI });
    await mongoCreateIndexes({ db: this.#db });
    const collections = await this.#db.listCollections().toArray();

    // instantiate the server
    this.#server = createServer({
      collections,
      liveCollections: this.#liveCollections,
      reservedCollections: this.#reservedCollections,
      config: this.#config,
      serverHeaderPrefix: this.#serverHeaderPrefix,
      serverKey: this.#serverKey,
      serverURL: this.#serverURL,
      serverSecret: this.#serverSecret,
      name: this.#name,
      poweredBy: this.#serverPoweredBy,
      query: this.query.bind(this),
      queryLimit: this.#queryLimit,
      plugin: this.plugin.bind(this),
      cache: this.#cache,
      db: this.#db,
      cloud: this.#cloud,
      inspect: this.#inspect,
    });

    // broadcast event
    this.onReady.next({
      db: this.#db,
      name: this.#name,
      server: this.#server,
      cloud: this.#cloud,
      cache: this.#cache,
    });

    // start cache invalidation
    this.#cache.clock();
    console.log(`📡 Borda Server v${Version}`);

    return this.#server;
  }

  plugin<T = undefined, Y = T>(
    hook: PluginHook
  ): ((params?: T) => Y) | undefined {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    let fn = undefined;
    this.plugins.find((plugin: ServerPlugin) => {
      const ph = plugin[hook as keyof ServerPlugin];

      if (ph && typeof ph === 'function') {
        fn = ph;
      }
    });

    return fn;
  }

  addPlugins(plugins: ServerPlugin[]) {
    const defaultEmailPlugin = {
      name: 'EmailProvider',
      version: '0.0.0',
      EmailProvider() {
        // implement your own email provider
        // the default one is just a console log
        return BordaEmailPlugin();
      },
    };

    const defaultEmailTemplatePlugin = {
      name: 'EmailPasswordResetTemplate',
      version: '0.0.0',
      EmailPasswordResetTemplate({
        token,
        user,
        baseUrl,
      }: {
        token: string;
        user: User;
        baseUrl: string;
      }) {
        // customize the reset password email template
        // the default one is a unstylized html
        return BordaEmailPasswordResetTemplatePlugin({ token, user, baseUrl });
      },
    };

    if (!plugins.find((it) => it['EmailProvider' as keyof typeof it])) {
      plugins.push(defaultEmailPlugin);
    }

    if (
      !plugins.find((it) => it['EmailPasswordResetTemplate' as keyof typeof it])
    ) {
      plugins.push(defaultEmailTemplatePlugin);
    }

    this.#plugins = plugins;
  }

  query<TSchema extends Document = Document>(collection: string) {
    return new BordaServerQuery<TSchema>({
      collection,
      inspect: this.#inspect,
      db: this.#db,
      cache: this.#cache,
      cloud: this.#cloud,
      queryLimit: this.#queryLimit,
    });
  }
}

export const BordaServer = Borda;