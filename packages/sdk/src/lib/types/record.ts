import { Document } from './query';

export interface Record extends Document {
  /**
   * auto generated by rest
   */
  objectId?: string;
  createdAt?: string;
  updatedAt?: string;
  /**
   * Date ISOString, optional.
   * when set it means session is deleted after this date.
   * by default Elegante will set this to 1 year after createdAt.
   */
  expiresAt?: string;
}
