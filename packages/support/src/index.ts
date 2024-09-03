import { z } from 'zod';

import { objectId, objectPointer } from '@borda/client';

/**
 * this file is used to share types and schemas between the server and the client
 */

export const UserId = objectId('users');
export const PostId = objectId('posts');
export const CommentId = objectId('comments');

export const UserPointer = objectPointer('users');
export const PostPointer = objectPointer('posts');
export const OrgPointer = objectPointer('orgs');

export const schema = {
  orgs: z.object({
    _id: objectId('orgs'),
    _created_at: z.string(),
    _updated_at: z.string(),
    name: z.string(),
  }),
  users: z.object({
    _id: UserId,
    _created_at: z.string(),
    _updated_at: z.string(),
    _p_org: OrgPointer,
    name: z.string(),
  }),
  posts: z.object({
    _id: PostId,
    _created_at: z.string(),
    _updated_at: z.string(),
    _p_user: UserPointer, // default way to reference the user (so nested queries work out of the box)
    _p_org: OrgPointer,
    title: z.string(),
    content: z.string(),
    author: UserPointer, // a custom way to reference the user
  }),
  comments: z.object({
    _id: CommentId,
    _created_at: z.string(),
    _updated_at: z.string(),
    _p_author: UserPointer,
    _p_post: PostPointer,
    _p_org: OrgPointer,
    content: z.string(),
  }),
};
