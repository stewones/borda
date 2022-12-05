export interface User {
  name: string;
  email: string;
  username: string;
  password?: string; // we don't expose this
  objectId: string; // auto generated
  createdAt: string; // Date ISOString, auto generated
  updatedAt: string; // Date ISOString, auto generated
  expiresAt?: string; // Date ISOString, optional. when set it means user is deleted after this date
}
