export const InternalHeaders = {
  apiSecret: 'Api-Secret',
  apiKey: 'Api-Key',
  apiMethod: 'Api-Method',
};

export const InternalCollectionName: {
  [key: string]: string;
} = {
  User: '_User',
  Session: '_Session', // @todo sign in/up , route protection, etc
  Job: '_Job', // @todo save job stats (idea: ship an example of a job to cleanup jobs :D so meta)
  Statistic: '_Statistic', // @todo workload statistics (enabled by Elegante Control Plane (?) or just Dashboard).
};

export const InternalFieldName: {
  [key: string]: string;
} = {
  createdAt: '_created_at',
  updatedAt: '_updated_at',
  objectId: '_id',
};

/**
 * these fields are not allowed to be set by the user
 * and also can't be exposed as they are reserved for the system
 * sensitive fields are removed by default from responses
 * unless you explicitly ask for them via `query.unlock(true)`
 */
export const InternalSensitiveFields = [
  /**
   * elegante fields
   */
  '_deleted_at',
  /**
   * Parse-Server fields
   * we don't want to expose these fields as they do
   * et elegante we agree that this kind of feature needs to be
   * implemented as a plugin to keep the core lean and fast
   **/
  '_acl',
  '_hashed_password',
  '_wperm',
  '_rperm',
];
