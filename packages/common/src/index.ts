/**
 * this file is used to share types and schemas between the server and the client
 */

import { z } from 'zod';

import {
  createObjectIdSchema,
  createPointer,
  createSchema,
  InstaSessionSchema,
  InstaUserEmailSchema,
  InstaUserPasswordSchema,
  InstaUserSchema,
  withOptions,
} from '@borda/client';

/**
 * Types composition
 */
export const OrgId = createObjectIdSchema('orgs');
export const UserId = createObjectIdSchema('users');
export const PostId = createObjectIdSchema('posts');
export const CommentId = createObjectIdSchema('comments');

export const orgPointer = (id: string) => createPointer('orgs', id);
export const userPointer = (id: string) => createPointer('users', id);
export const postPointer = (id: string) => createPointer('posts', id);
export const commentPointer = (id: string) => createPointer('comments', id);

export type User = z.infer<typeof UserSchema>;
export type Org = z.infer<typeof OrgSchema>;
export type Post = z.infer<typeof PostSchema>;
export type Comment = z.infer<typeof CommentSchema>;

/**
 * Schemas definition
 */
export const OrgSchema = createSchema('orgs', {
  name: z.string(),
});

export const UserSchema = withOptions(
  InstaUserSchema.extend({
    org: OrgSchema.optional(), // for client runtime type safety (not obligatory)
    _p_org: z.string().optional(), // pointer to the org
    _password: withOptions(z.string().optional(), {
      sync: false,
      description: 'the user password is never synced',
    }),
  }),
  {
    sync: true, // change to false to skip syncing the whole collection
    description: 'the user schema, all fields are synced except the password',
  }
);

export const SessionSchema = withOptions(InstaSessionSchema, {
  sync: false,
  description: 'the session schema, never synced',
});

export const PostSchema = createSchema('posts', {
  _p_user: z.string(), // default way to reference the user (so nested queries work out of the box)
  _p_org: z.string(),
  title: z.string(),
  content: z.string(),
  author: z.string(), // a custom way to reference the user
  user: z.optional(UserSchema), // injected by the client
  org: z.optional(OrgSchema), // injected by the client
});

export const CommentSchema = createSchema('comments', {
  _p_author: z.string(),
  _p_post: z.string(),
  _p_org: z.string(),
  content: z.string(),
});

export const SyncSchema = {
  orgs: OrgSchema,
  users: UserSchema,
  posts: PostSchema,
  comments: CommentSchema,
  sessions: SessionSchema,
};

export const CloudSchema = {
  headers: {
    logout: z.object({
      authorization: z.string().regex(/^Bearer /),
    }),
  },
  body: {
    login: withOptions(
      z.object({
        email: InstaUserEmailSchema,
        password: InstaUserPasswordSchema,
      }),
      {
        public: true,
        description: 'cloud login - public endpoint which does not need auth.',
      }
    ),
    logout: withOptions(z.object({}), {
      public: true,
      description: 'cloud logout - public endpoint which does not need auth.',
    }),
    'sign-up': withOptions(
      z.object({
        name: z.string(),
        email: InstaUserEmailSchema,
        password: InstaUserPasswordSchema,
      }),
      {
        public: true,
        description:
          'cloud create account - public endpoint which does not need auth.',
      }
    ),
  },
  response: {
    login: z.object({
      token: z.string(),
      user: InstaUserSchema,
    }),
    'sign-up': z.object({
      token: z.string(),
      user: InstaUserSchema,
    }),
  },
};


