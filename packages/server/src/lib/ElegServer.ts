import { Db } from 'mongodb';
import { Application } from 'express';

export interface ElegServerProtocol {
  params: ServerParams;
  app: Application;
  db: Db;
}

export interface ServerParams {
  databaseURI: string;
  apiKey: string;
  apiSecret: string;
  serverURL: string;
  serverHeaderPrefix?: string;
  joinCacheTTL?: number;
}
export interface ServerEvents {
  onDatabaseConnect: (db: Db) => void;
}

export const ElegServerDefaultParams: Partial<ElegServerDefault> = {
  serverHeaderPrefix: 'X-Elegante',
  joinCacheTTL: 1000 * 1,
  events: {
    // eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
    onDatabaseConnect: (db: Db) => {},
  },
};

export const ElegServer: ElegServerProtocol = {
  params: {} as ServerParams,
  app: {} as Application,
  db: {} as Db,
  ...ElegServerDefaultParams,
};

export interface ElegServerDefault extends ServerParams {
  events: ServerEvents;
}
