import { Record } from './record';
import { User } from './user';

export interface Session extends Record {
  user: User;
  token: string;
}
