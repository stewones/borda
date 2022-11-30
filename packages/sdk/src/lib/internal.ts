import { objectFlip } from './utils';

export const InternalCollectionName: {
  [key: string]: string;
} = {
  User: '_User',
  Session: '_Session',
  Job: '_Job',
  Statistic: '_Statistic', // workload statistics (enabled by Elegante Control Plane (?) or just Dashboard @todo).
};

export const ExternalCollectionName = objectFlip(InternalCollectionName);

export const InternalFieldName: {
  [key: string]: string;
} = {
  createdAt: '_created_at',
  updatedAt: '_updated_at',
  objectId: '_id',
};

export const ExternalFieldName = objectFlip(InternalFieldName);
