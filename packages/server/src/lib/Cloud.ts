/* eslint-disable @typescript-eslint/no-explicit-any */
import { Document, InternalCollectionName } from '@borda/client';

import { BordaRequest } from './Borda';
import { DocQRL } from './parse';

type CloudTriggerProtocol = Map<string, CloudTriggerFactory>;

type CloudTriggerEvent =
  | 'beforeSave'
  | 'beforeSaveMany'
  | 'afterSave'
  | 'afterSaveMany'
  | 'beforeDelete'
  | 'afterDelete'
  | 'beforeSignUp';

type CloudFunctionProtocol = Map<string, CloudFunctionParams>;

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

export interface CloudTriggerFactory {
  collection?: string;
  event: CloudTriggerEvent;
  fn: CloudTriggerCallback;
}

export type CloudFunctionHandler = (
  factory: CloudFunctionFactory
) => Promise<boolean | Document | Document[] | void>;

export interface CloudFunctionParams {
  name?: string;
  public?: boolean;
  handler?: CloudFunctionHandler;
}

export interface CloudFunctionFactory {
  request: BordaRequest;
  body: any;
  params: Record<string, any>;
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
   * functions are called via POST requests or via the Borda SDK
   *
   * SDK
   *
   * import { init, runFunction } from '@borda/client';
   *
   * init({ ... });
   *
   * await runFunction('sendEmail', { to: '...', subject: '...', body: '...' });
   *
   * POST
   *
   * curl --location --request POST 'http://localhost:1337/server/functions/somePublicTask' \
   * --header 'X-Borda-Api-Key: **borda**'
   *
   * To create a new function, use the following syntax:
   *
   * import { Cloud } from '@borda/server';
   *
   * Cloud.addFunction('somePublicTask', { public: true }, async ({ req, res }) => {
   *     print('executing', `somePublicTask`, req.body);
   *     await delay(3000);
   *     print(`somePublicTask done`);
   *     res.status(200).send(`somePublicTask done`);
   *   }
   * );
   */
  addFunction(
    handler: CloudFunctionHandler,
    params: Omit<CloudFunctionParams, 'handler'>
  ) {
    // extract the function name from the handler
    // optionally, the name can be passed as a parameter
    const name = params.name || handler.name;
    this.fn.set(name, { ...params, name, handler });
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
