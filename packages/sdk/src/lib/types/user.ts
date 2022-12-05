import { Record } from './record';

export interface User extends Record {
  name: string;
  email: string;
  password?: string; // we don't expose this
}
