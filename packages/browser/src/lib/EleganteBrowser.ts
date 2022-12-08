import {
  EleganteError,
  ErrorCode,
  log,
  print,
  isEmpty,
  FilterOperations,
  Sort,
  Document,
} from '@elegante/sdk';

interface EleganteBrowserProtocol {
  params: BrowserParams;
}

export interface BrowserParams {
  databaseURI: string;
  apiKey: string;
  apiSecret: string;
  serverURL: string;
  serverHeaderPrefix?: string;

  /**
   * Default to 1h for document time-to-live.
   * it means that some internal queries will hit memory and be invalidated on every hour.
   * *unless* related docs are updated/deleted in the database, then its cache is invalidated immediately.
   * this is so we don't need to be accessing database every time we need to get a document.
   */
  documentCacheTTL: number;
}

export abstract class ServerEvents {
  public static onDatabaseConnect = new Subject<{ db: Db }>();
  public static onLiveQueryConnect = new Subject<{
    ws: WebSocket;
    incoming: IncomingMessage;
  }>();
}

const ServerDefaultParams: Partial<ServerParams> = {
  serverHeaderPrefix: 'X-Elegante',
  documentCacheTTL: 1000 * 60 * 60,
};

export const EleganteServer: EleganteServerProtocol = {
  app: {} as Application,
  db: {} as Db,
  params: {
    ...ServerDefaultParams,
  },
} as EleganteServerProtocol;

async function mongoConnect({ params }: { params: ServerParams }) {
  try {
    const client = new MongoClient(params.databaseURI);
    await client.connect();
    return client.db();
  } catch (err) {
    return Promise.reject(
      new EleganteError(ErrorCode.CONNECTION_FAILED, err as object)
    );
  }
}

async function createIndexes({ db, params }: { db: Db; params: ServerParams }) {
  try {
    const collections = db.listCollections();
    const collectionsArray = await collections.toArray();
    for (const collection of collectionsArray) {
      if (
        collection.type === 'collection' &&
        !collection.name.startsWith('system.')
      ) {
        /**
         * create _expires_at index used for internal soft deletes
         * ie: we don't actually delete the document, we just set _expires_at to a new Date() object
         * representing the TTL. Then mongo will automatically delete the document after the TTL expires
         * so project-wide, we should never directly delete a documentif we want to keep a record of it. ie: hooks like afterDelete
         */
        await db
          .collection(collection.name)
          .createIndex({ _expires_at: 1 }, { expireAfterSeconds: 0 });
      }
    }
    return;
  } catch (err) {
    print(
      `Elegante couldn't create indexes on startup`,
      new EleganteError(ErrorCode.INDEX_CREATION_FAILED, err as any)
    );
  }
}

/**
 * spin up a new elegante server instance
 */
export function createServer(options: Partial<ServerParams>): Application {
  const app = (EleganteServer.app = express());

  EleganteServer.params = { ...EleganteServer.params, ...options };

  const params = EleganteServer.params;

  rest({
    app,
    params,
  });

  mongoConnect({ params })
    .then((db) => {
      try {
        EleganteServer.db = db;
        createIndexes({ db, params });
        ServerEvents.onDatabaseConnect.next({ db });
      } catch (err) {
        print(err);
      }
    })
    .catch((err) => log(err));

  print(`Elegante Server v${Version}`);

  if (params.documentCacheTTL <= 0) {
    Cache.disable();
    print('❗ Document cache has been disabled.');
    print(
      '❗ Be sure to set documentCacheTTL to a positive number in production to boost queries performance.'
    );
  }

  return app;
}

export function createFindCursor<T extends Document>(docQRL: DocQRL) {
  const { collection$, options, filter, sort, projection, limit, skip } =
    docQRL;

  const { allowDiskUse } = options || {};

  /**
   * decode sort
   */
  for (const fieldName in sort) {
    if (InternalFieldName[fieldName]) {
      sort[InternalFieldName[fieldName]] = sort[fieldName];
      delete sort[fieldName];
    }
  }

  const cursor = collection$.find<T>(parseFilter(filter), {
    sort,
    projection,
    ...options,
  });

  if (allowDiskUse) {
    cursor.allowDiskUse(true);
  }

  if (limit) {
    cursor.limit(limit);
  }

  if (skip) {
    cursor.skip(skip);
  }

  return cursor;
}

/**
 * allowed operators for watch (query.on())
 * see https://www.mongodb.com/docs/manual/reference/method/Mongo.watch/#mongodb-method-Mongo.watch
 *
 * @export
 * @template TSchema
 * @param {{
 *   filter: FilterOperations<TSchema>;
 *   pipeline: Document[];
 *   projection: Partial<{
 *     [key in keyof TSchema]: number;
 *   }>;
 *   sort?: Sort;
 *   limit?: number;
 *   skip?: number;
 * }} bridge
 * @returns {*}
 */
export function createPipeline<TSchema>(bridge: {
  filter: FilterOperations<TSchema>;
  pipeline?: Document[] | undefined;
  projection: Partial<{
    [key in keyof TSchema]: number;
  }>;
  sort?: Sort;
  limit?: number;
  skip?: number;
}) {
  const { filter, pipeline, sort, projection, limit, skip } = bridge;
  return [
    ...(!isEmpty(filter) ? [{ $match: parseFilter(filter) }] : []),
    ...parseFilter(pipeline ?? []),
    ...(!isEmpty(sort) ? [{ $sort: sort }] : []),
    ...(!isEmpty(projection) ? [{ $project: projection }] : []),
    ...(typeof limit === 'number' ? [{ $limit: limit }] : []),
    ...(typeof skip === 'number' ? [{ $skip: skip }] : []),
  ];
}

export async function createSession(user: User) {
  /**
   * because we don't want to expose the user password
   */
  delete user.password;

  /**
   * expires in 1 year
   * @todo make this an option ?
   */
  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  /**
   * generate a new session token
   */
  const token = `e:${newToken()}`;
  const session = await query<Partial<Session>>('Session')
    .unlock(true)
    .insert({
      user: pointer('User', user.objectId),
      token,
      expiresAt: expiresAt.toISOString(),
    });

  delete session.updatedAt;
  delete session.objectId;

  return { ...session, user };
}
