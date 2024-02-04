/* eslint-disable @typescript-eslint/no-explicit-any */
import { Document, InternalCollectionName } from '@borda/client';

import { BordaRequest } from './Borda';
import { DocQRL } from './parse';

// type CloudFactory<T = any> = (
//   factory: CloudTriggerParams<T>
// ) =>
//   | Promise<CloudTriggerCallback<T>>
//   | CloudTriggerCallback<T>
//   | boolean
//   | void;

type CloudTriggerProtocol = Map<string, CloudTriggerFactory>;

type CloudTriggerEvent =
  | 'beforeSave'
  | 'beforeSaveMany'
  | 'afterSave'
  | 'afterSaveMany'
  | 'beforeDelete'
  | 'afterDelete'
  | 'beforeSignUp';

type CloudFunctionProtocol = Map<string, CloudFunctionOptions>;

export interface CloudTriggerParams<T = any> {
  doc?: T;
  docs?: T[];
  before?: T;
  after?: T;
  qrl: DocQRL;
  context?: Record<string, any>;
  request?: BordaRequest;
}

export type CloudTriggerCallback<T = any> = (options: CloudTriggerParams) => T;

interface CloudTriggerFactory {
  collection?: string;
  event: CloudTriggerEvent;
  fn: CloudTriggerCallback;
}

interface CloudFunctionOptions {
  name: string;
  isPublic?: boolean;
  fn: (
    factory: CloudFunctionFactory
  ) => Promise<boolean | Document | Document[] | void>;
}

interface CloudFunctionFactory {
  request: BordaRequest;
}

export class Cloud {
  #fn: CloudFunctionProtocol = new Map();
  #trigger: CloudTriggerProtocol = new Map();

  get fn() {
    return this.#fn;
  }

  get trigger() {
    return this.#trigger;
  }

  beforeSignUp<T = Document>(fn: CloudTriggerCallback<T>) {
    this.trigger.set(`beforeSignUp`, {
      event: 'beforeSignUp',
      fn,
    });
  }

  beforeSave<T = Document>(collection: string, fn: CloudTriggerCallback<T>) {
    collection = InternalCollectionName[collection] ?? collection;
    this.trigger.set(`${collection}.beforeSave`, {
      collection,
      event: 'beforeSave',
      fn,
    });
  }

  afterSave<T = Document>(collection: string, fn: CloudTriggerCallback<T>) {
    collection = InternalCollectionName[collection] ?? collection;
    this.trigger.set(`${collection}.afterSave`, {
      collection,
      event: 'afterSave',
      fn,
    });
  }

  afterDelete<T = Document>(collection: string, fn: CloudTriggerCallback<T>) {
    collection = InternalCollectionName[collection] ?? collection;
    this.trigger.set(`${collection}.afterDelete`, {
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
  addFunction(
    name: string,
    options: Pick<CloudFunctionOptions, 'isPublic'>,
    fn: (factory: CloudFunctionFactory) => Promise<Document | Document[] | void>
  ) {
    const cloudFn: CloudFunctionOptions = {
      ...options,
      name,
      fn,
    };
    this.fn.set(name, cloudFn);
  }

  getCloudTrigger(collection: string, event: CloudTriggerEvent) {
    return this.trigger.get(
      `${InternalCollectionName[collection] ?? collection}.${event}`
    );
  }

  getCloudBeforeSignUpTrigger() {
    return this.trigger.get(`beforeSignUp`);
  }

  getCloudFunction(name: string) {
    return this.fn.get(name);
  }
}
