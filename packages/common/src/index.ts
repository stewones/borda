/**
 * this file is used to share types and schemas between the server and the client
 */

import { z } from 'zod';

import {
  createObjectIdSchema,
  createPointer,
  createSchema,
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

export const UserSchema = createSchema('users', {
  _p_org: z.string(),
  org: z.optional(OrgSchema), // injected by the client
  name: z.string(),
  email: z.string().email(),
});

export const PostSchema = createSchema('posts', {
  _p_user: z.string(), // default way to reference the user (so nested queries work out of the box)
  _p_org: z.string(),
  title: z.string(),
  content: z.string(),
  author: z.string(), // a custom way to reference the user
});

export const CommentSchema = createSchema('comments', {
  _p_author: z.string(),
  _p_post: z.string(),
  _p_org: z.string(),
  content: z.string(),
});

export const schema = {
  orgs: OrgSchema,
  users: UserSchema,
  posts: PostSchema,
  comments: CommentSchema,
};
