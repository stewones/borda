import { Db } from 'mongodb';
import { Application } from 'express';

export interface EleganteServerProtocol {
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
  serverWatchCollections?: string; // ?? @todo see if this is necessary
  includeCacheTTL: number;
}
export interface ServerEvents {
  onDatabaseConnect: (db: Db) => void;
}

export const EleganteServerDefaultParams: Partial<EleganteServerDefault> = {
  serverHeaderPrefix: 'X-Elegante',
  includeCacheTTL: 1337,
  events: {
    // eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
    onDatabaseConnect: (db: Db) => {},
  },
};

export const EleganteServer: EleganteServerProtocol = {
  params: {} as ServerParams,
  app: {} as Application,
  db: {} as Db,
  ...EleganteServerDefaultParams,
};

export interface EleganteServerDefault extends ServerParams {
  events: ServerEvents;
}
