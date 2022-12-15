import { EleganteClient } from './Client';

export const InternalHeaders = {
  apiSecret: 'Api-Secret',
  apiKey: 'Api-Key',
  apiMethod: 'Api-Method',
  apiToken: 'Api-Token',
};

export const InternalCollectionName: {
  [key: string]: string;
} = {
  User: '_User',
  Session: '_Session',
  Job: '_Job', // @todo save job stats (idea: ship an example of a job to cleanup jobs :D so meta)
};

export const InternalFieldName: {
  [key: string]: string;
} = {
  objectId: '_id',
  createdAt: '_created_at',
  updatedAt: '_updated_at',
  expiresAt: '_expires_at',
  token: '_session_token',
  password: '_hashed_password',
};

/**
 * these fields can't be exposed as they are reserved for the system
 * sensitive fields are removed by default from responses
 * unless you explicitly ask for them via `query.unlock(true)`
 */
export const InternalSensitiveFields = [
  /**
   * elegante fields
   */
  'password',
  '_expires_at',
  '_session_token',
  '_hashed_password',

  /**
   * Parse-Server fields
   * we don't want to expose these fields in any way
   * et elegante we agree that some functionalities Parse provides
   * needs to be implemented externally as a plugin to keep the core lean and fast
   **/
  '_acl',
  '_wperm',
  '_rperm',
  '_auth_data_MagicAuth',
];
