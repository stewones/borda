import { Request, Response } from 'express';

import { Document, InternalCollectionName, Session } from '@elegante/sdk';

import { routeEnsureAuth } from './route';

import { DocQRL } from './parseQuery';
import { EleganteServer } from './Server';

type CloudTriggerProtocol = Map<string, CloudTriggerOptions>;

type CloudTriggerEvent =
  | 'beforeSave'
  | 'afterSave'
  | 'beforeDelete'
  | 'afterDelete';

type CloudFunctionProtocol = Map<string, CloudFunctionOptions>;

interface CloudTriggerFactory {
  req: Request;
  res: Response;
  docQRL: DocQRL;
  before: Document | null | undefined;
  after: Document | null | undefined;
}

interface CloudTriggerOptions {
  collection: string;
  event: CloudTriggerEvent;
  fn: (factory: CloudTriggerFactory) => Promise<boolean> | void;
}

interface CloudFunctionOptions {
  name: string;
  isPublic?: boolean;
  fn: (
    factory: CloudFunctionFactory
  ) => Promise<boolean | Document | Document[] | void>;
}

interface CloudFunctionFactory {
  req: Request;
  res: Response;
  session?: Session | undefined;
}

interface CloudJobOptions {
  name: string;
}

const CloudFunction: CloudFunctionProtocol = new Map();
const CloudTrigger: CloudTriggerProtocol = new Map();

export function getCloudTrigger(collection: string, event: CloudTriggerEvent) {
  return CloudTrigger.get(`${collection}.${event}`);
}

export function getCloudFunction(name: string) {
  return CloudFunction.get(name);
}

export abstract class Cloud {
  public static beforeSave(
    collection: string,
    fn: (factory: CloudTriggerFactory) => Promise<boolean>
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
    fn: (factory: CloudTriggerFactory) => void
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
    fn: (factory: CloudTriggerFactory) => void
  ) {
    collection = InternalCollectionName[collection] ?? collection;
    CloudTrigger.set(`${collection}.afterDelete`, {
      collection,
      event: 'afterDelete',
      fn,
    });
  }

  /**
   * Attach a new function to Elegant Server
   *
   * - Cloud Functions can be public (i.e. no secret key is required to call them, api key is required still)
   * - Cloud Functions depends on your response to complete the http request call, so it's subject to timeouts
   * - Cloud Functions are suited for lighter tasks like registering emails, processing some little data, etc
   *
   * functions are called via POST requests or via the Elegante SDK
   *
   * SDK
   *
   * import { init, runFunction } from '@elegante/sdk';
   *
   * init({ ... });
   *
   * await runFunction('sendEmail', { to: '...', subject: '...', body: '...' });
   *
   * POST
   *
   * curl --location --request POST 'http://localhost:1337/server/functions/somePublicTask' \
   * --header 'X-Elegante-Api-Key: **elegante**'
   *
   * To create a new function, use the following syntax:
   *
   * import { Cloud } from '@elegante/server';
   *
   * Cloud.addFunction('somePublicTask', { isPublic: true }, async ({ req, res }) => {
   *     print('executing', `somePublicTask`, req.body);
   *     await delay(3000);
   *     print(`somePublicTask done`);
   *     res.status(200).send(`somePublicTask done`);
   *   }
   * );
   *
   * @static
   * @param {string} name
   * @param {Pick<CloudFunctionOptions, 'isPublic'>} options
   * @param {((
   *       factory: CloudFunctionFactory
   *     ) => Promise<Document | Document[] | void>)} fn
   * @memberof Cloud
   */
  public static addFunction(
    name: string,
    options: Pick<CloudFunctionOptions, 'isPublic'>,
    fn: (factory: CloudFunctionFactory) => Promise<Document | Document[] | void>
  ) {
    const cloudFn: CloudFunctionOptions = {
      ...options,
      name,
      fn,
    };
    createFunction(cloudFn);
    CloudFunction.set(name, cloudFn);
  }

  /**
   * Attach a new Job to Elegant Server
   *
   * - Cloud Jobs can't be public (i.e. secret key is required to call them)
   * - Cloud Jobs run indefinitely until you return a value or throw an exception
   * - Cloud Jobs are suited for heavier tasks like sending emails, processing images, etc
   *
   * jobs are called via POST requests or via the Elegante SDK
   *
   * SDK (server only)
   *
   * import { init, runJob } from '@elegante/sdk';
   *
   * init({ ... });
   *
   * await runJob('sendEmail', { to: '...', subject: '...', body: '...' });
   *
   * POST
   *
   * curl --location --request POST 'http://localhost:1337/server/jobs/someHeavyJob' \
   *   --header 'X-Elegante-Api-Key: **elegante**' \
   *   --header 'X-Elegante-Secret-Key: **secret**'
   *
   * To create a new Job, use the following syntax:
   *
   * Cloud.addJob('someHeavyJob', async ({req}) => {
   *    print('executing', `someHeavyJob`, req.body);
   *    await delay(3000);
   *    print(`someHeavyJob done`);
   *    return `someHeavyJob done`;
   * }
   *
   * @static
   * @param {string} name
   * @param {((callback: { req: Request }) => Promise<string | void>)} fn
   * @returns {*}
   * @memberof Cloud
   */
  public static addJob(
    name: string,
    fn: (callback: { req: Request }) => Promise<string | void>
  ) {
    return createJob({ name }, fn);
  }
}

function createFunction(options: CloudFunctionOptions): void {
  const { app, params } = EleganteServer;
  const { name, fn } = options;
  app.post(
    `/functions/${name}`,
    // routeHandlePublicFunction(options),
    routeEnsureAuth({
      params,
    }),
    async (req: Request, res: Response) => {
      if (EleganteServer.params.debug) {
        console.time(`function duration: ${name}`);
      }
      try {
        await fn({ req, res, session: res.locals['session'] });
        // @todo save statistic to db when we have Elegante Models
        if (EleganteServer.params.debug) {
          console.timeEnd(`function duration: ${name}`);
        }
      } catch (err) {
        res.status(500).send(err);
        if (EleganteServer.params.debug) {
          console.timeEnd(`function duration: ${name}`);
        }
        // @todo save statistic to db when we have Elegante Models
      }
    }
  );
}

function createJob(
  options: CloudJobOptions,
  fn: (callback: { req: Request }) => Promise<string | void>
): void {
  const { app } = EleganteServer;
  app.post(`/jobs/${options.name}`, async (req: Request, res: Response) => {
    console.time(`job duration: ${options.name}`);
    try {
      res.status(200).send('🚀');
      const r = await fn({ req }); // @todo save result to db when we have Elegante Models
      console.timeEnd(`job duration: ${options.name}`);
    } catch (err) {
      // @todo save error to db when we have Elegante Models
      res.status(500).send(err);
      console.timeEnd(`job duration: ${options.name}`);
    }
  });
}
