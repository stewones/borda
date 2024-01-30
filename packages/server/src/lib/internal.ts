export const BordaHeaders = {
  apiSecret: 'Api-Secret',
  apiKey: 'Api-Key',
  apiMethod: 'Api-Method',
  apiToken: 'Api-Token',
  apiInspect: 'Api-Inspect',
  apiTimeZone: 'Api-TimeZone',
};

export const BordaCollectionName: {
  [key: string]: string;
} = {
  User: '_User',
  Session: '_Session',
  Password: '_Password',
};

export const BordaFieldName: {
  [key: string]: string;
} = {
  objectId: '_id',
  createdAt: '_created_at',
  updatedAt: '_updated_at',
  expiresAt: '_expires_at',
  token: '_token',
  password: '_hashed_password',
};

/**
 * these fields can't be exposed as they are reserved for the system
 * sensitive fields are removed by default from responses
 * unless you explicitly ask for them via `query.unlock()`
 */
export const BordaSensitiveFields = [
  'password',
  '_expires_at',
  '_token',
  '_hashed_password',
];
