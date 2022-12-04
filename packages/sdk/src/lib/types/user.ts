export interface User {
  name: string;
  email: string;
  username: string;
  password: string;
  objectId: string; // auto generated
  createdAt: string; // Date ISOString, auto generated
  updatedAt: string; // Date ISOString, auto generated
  deletedAt?: string; // Date ISOString, optional. when set it means user is deleted after this date
}
