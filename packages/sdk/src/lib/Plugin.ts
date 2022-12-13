import { ActiveParams } from './Active';
import { EleganteClient } from './Client';
import { Document } from './types/query';

export type PluginHook =
  | 'ActiveRecordBeforeDocumentSave'
  | 'ActiveRecordOnDocumentRead';

export interface ElegantePlugin {
  name: string;
  version: string;

  ActiveRecordBeforeDocumentSave?: (params: {
    doc: Document;
    params: ActiveParams<Document>;
  }) => Promise<Document>;
  ActiveRecordOnDocumentRead?: (params: {
    doc: Document;
    params: ActiveParams<Document>;
  }) => void;
}

export const getPluginHook = (hook: PluginHook) => {
  let fn = null;
  EleganteClient.params.plugins?.find((plugin) => {
    if (plugin[hook]) fn = plugin[hook];
  });

  return fn;
};
