/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */

import { ActiveParams } from './Active';
import { EleganteClient } from './Client';
import {
  EmailPasswordResetParams,
  EmailPasswordResetParamsCallback,
  EmailProvider,
} from './Provider';
import { Document } from './types/query';

export type ElegantePlugin = ClientPlugin | ServerPlugin;

export type PluginHook =
  | 'ActiveRecordBeforeDocumentSave'
  | 'ActiveRecordOnDocumentRead'
  | 'EmailProvider'
  | 'EmailPasswordResetTemplate';

export interface ClientPlugin {
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

export interface ServerPlugin {
  name: string;
  version: string;
  EmailProvider?: () => EmailProvider;
  EmailPasswordResetTemplate?: (
    params: EmailPasswordResetParams
  ) => EmailPasswordResetParamsCallback;
}

export function getPluginHook<T = undefined, Y = T>(
  hook: PluginHook
): ((params?: T) => Y) | undefined {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let fn = undefined;
  EleganteClient.params.plugins?.find((plugin: ElegantePlugin) => {
    const ph = plugin[hook as keyof ElegantePlugin];

    if (ph && typeof ph === 'function') {
      fn = ph;
    }
  });

  return fn;
}
