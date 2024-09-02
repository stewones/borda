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

export const schema = {
  users: z.object({
    _id: UserId,
    _created_at: z.string(),
    _updated_at: z.string(),
    name: z.string(),
  }),
  posts: z.object({
    _id: PostId,
    _created_at: z.string(),
    _updated_at: z.string(),
    title: z.string(),
    content: z.string(),
    author: UserPointer,
    user: UserPointer,
  }),
  comments: z.object({
    _id: CommentId,
    _created_at: z.string(),
    _updated_at: z.string(),
    author: UserPointer,
    posts: PostPointer,
    content: z.string(),
  }),
};
