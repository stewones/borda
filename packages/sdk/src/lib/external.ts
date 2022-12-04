import { InternalCollectionName, InternalFieldName } from './internal';
import { objectFlip } from './utils';

export const ExternalCollectionName = objectFlip(InternalCollectionName);
export const ExternalFieldName = objectFlip(InternalFieldName);
