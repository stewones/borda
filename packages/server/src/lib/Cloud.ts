import { Request, Response } from 'express';

import {
  runFunction,
  Document,
  InternalCollectionName,
  Session,
} from '@elegante/sdk';

import { EleganteServer } from './EleganteServer';
import { EleganteClient } from '@elegante/sdk';
import { routeEnsureAuth, routeHandlePublicFunction } from './route';

import { createJob } from './createJob';
import { DocQRL } from './parseQuery';

export type CloudTriggerProtocol = Map<string, CloudTriggerOptions>;

export type CloudTriggerEvent =
  | 'beforeSave'
  | 'afterSave'
  | 'beforeDelete'
  | 'afterDelete';

export const CloudTrigger: CloudTriggerProtocol = new Map();

export interface CloudTriggerCallback {
  req: Request;
  res: Response;
  docQRL: DocQRL;
  before: Document | null | undefined;
  after: Document | null | undefined;
}

export interface CloudTriggerOptions {
  collection: string;
  event: CloudTriggerEvent;
  fn: (callback: CloudTriggerCallback) => Promise<boolean> | void;
}

export const CloudFunction: CloudFunctionProtocol = new Map();
export type CloudFunctionProtocol = Map<string, CloudFunctionOptions>;

export interface CloudFunctionOptions {
  name: string;
  isPublic?: boolean;
  fn: (
    callback: CloudFunctionCallback
  ) => Promise<boolean | Document | Document[] | void>;
}

export interface CloudFunctionCallback {
  req: Request;
  res: Response;
  session?: Session | undefined;
}

export function getCloudTrigger(collection: string, event: CloudTriggerEvent) {
  return CloudTrigger.get(`${collection}.${event}`);
}

export function getCloudFunction(name: string) {
  return CloudFunction.get(name);
}

export abstract class Cloud {
  public static beforeSave(
    collection: string,
    fn: (callback: CloudTriggerCallback) => Promise<boolean>
  ) {
    collection = InternalCollectionName[collection] ?? collection;
    CloudTrigger.set(`${collection}.beforeSave`, {
      collection,
      event: 'beforeSave',
      fn,
    });
  }

  public static afterSave(
    collection: string,
    fn: (callback: CloudTriggerCallback) => void
  ) {
    collection = InternalCollectionName[collection] ?? collection;
    CloudTrigger.set(`${collection}.afterSave`, {
      collection,
      event: 'afterSave',
      fn,
    });
  }

  public static afterDelete(
    collection: string,
    fn: (callback: CloudTriggerCallback) => void
  ) {
    collection = InternalCollectionName[collection] ?? collection;
    CloudTrigger.set(`${collection}.afterDelete`, {
      collection,
      event: 'afterDelete',
      fn,
    });
  }

  public static addFunction(
    name: string,
    options: Pick<CloudFunctionOptions, 'isPublic'>,
    fn: (
      callback: CloudFunctionCallback
    ) => Promise<Document | Document[] | void>
  ) {
    const cloudFn: CloudFunctionOptions = {
      ...options,
      name,
      fn,
    };
    createFunction(cloudFn);
    CloudFunction.set(name, cloudFn);
  }

  public static runFunction(name: string, doc: Document) {
    return runFunction(name, doc);
  }

  public static addJob(
    name: string,
    fn: (req: Request) => Promise<string | void>
  ) {
    return createJob({ name }, fn);
  }
}

// export const CloudFunction: CloudFunctionProtocol = new Map();

/**
 * Attach a function to Elegant Server
 *
 * - Cloud Functions can be public (i.e. no secret key is required to call them, api key is required still)
 * - Cloud Functions depends on your response to complete the http request call, so it's subject to timeouts
 * - Cloud Functions are suited for lighter tasks like registering emails, processing some data, etc
 *
 * functions are called via POST requests or via the Elegante SDK
 *
 * SDK
 *
 * import { createClient, runFunction } from '@elegante/sdk';
 *
 * createClient({ ... });
 *
 * await runFunction('sendEmail', { to: '...', subject: '...', body: '...' });
 *
 * POST
 *
 * curl --location --request POST 'http://localhost:1337/server/functions/some/inner/logic' \
 * --header 'X-Elegante-Api-Key: ELEGANTE_SERVER'
 *
 *
 * @export
 * @param {CloudFunctionOptions} options
 * @param {(req: Request, res: Response) => Promise<void>} fn
 */
function createFunction(options: CloudFunctionOptions): void {
  const { app, params } = EleganteServer;
  const { name, fn } = options;
  app.post(
    `/functions/${name}`,
    routeHandlePublicFunction(options),
    routeEnsureAuth({
      params,
    }),
    async (req, res) => {
      if (EleganteClient.params.debug) {
        console.time(`function duration: ${name}`);
      }
      try {
        await fn({ req, res, session: res.locals['session'] });
        // @todo save statistic to db when we have Elegante Models
        if (EleganteClient.params.debug) {
          console.timeEnd(`function duration: ${name}`);
        }
      } catch (err) {
        res.status(500).send(err);
        if (EleganteClient.params.debug) {
          console.timeEnd(`function duration: ${name}`);
        }
        // @todo save statistic to db when we have Elegante Models
      }
    }
  );
}
