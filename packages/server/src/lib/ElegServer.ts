import { Db } from 'mongodb';
import { Application } from 'express';
import { ServerParams } from './createServer';

export interface ElegServerProtocol {
  params: ServerParams;
  app: Application;
  db: Db;
}

export const ElegServer: ElegServerProtocol = {
  params: {} as ServerParams,
  app: {} as Application,
  db: {} as Db,
};
