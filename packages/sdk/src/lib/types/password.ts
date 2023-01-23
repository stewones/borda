import { Record } from './record';
import { User } from './user';

export interface Password extends Record {
  user: User;
  type: 'forgot' | 'history';
  expiresAt: string;
  password?: string;
  token?: string;
  email?: string;
}
