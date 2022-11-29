import { Db } from 'mongodb';
import { Application } from 'express';
import { EleganteServerParams } from './createServer';

export interface EleganteServerProtocol {
  params: EleganteServerParams;
  app: Application;
  db: Db;
}

export const EleganteServer: EleganteServerProtocol = {
  params: {} as EleganteServerParams,
  app: {} as Application,
  db: {} as Db,
};
