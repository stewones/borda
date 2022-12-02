import { objectFlip } from './utils';

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

export const ExternalCollectionName = objectFlip(InternalCollectionName);
export const ExternalFieldName = objectFlip(InternalFieldName);

export const InternalSensitiveFields = [
  '_acl',
  '_hashed_password',
  '_wperm',
  '_rperm',
  '_deleted',
];
