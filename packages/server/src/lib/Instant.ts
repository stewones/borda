import { Static, StatusMap, t } from 'elysia';
import type { HTTPHeaders } from 'elysia/dist/types';

/* eslint-disable @typescript-eslint/no-unused-vars */
import { InstantSyncResponse, InstantSyncStatus } from '@borda/client';
import { Borda } from '@borda/server';

export interface SetOptions {
  headers: HTTPHeaders;
  status?: number | keyof StatusMap;
}

const SyncParamsSchema = <T extends string>(collections: readonly T[]) =>
  t.Object({
    collection: t.Union(collections.map((c) => t.Literal(c))),
  });

const SyncQuerySchema = t.Object({
  synced: t.Optional(t.Union([t.Null(), t.Date()])),
  activity: t.Union([t.Literal('recent'), t.Literal('oldest')]),
});

export class Instant {
  #size = 1_000;
  #borda!: Borda;

  static SyncParamsSchema = SyncParamsSchema;
  static SyncQuerySchema = SyncQuerySchema;

  constructor({ size }: { size?: number | undefined }) {
    this.#size = size || this.#size;
  }

  attach(borda: Borda) {
    this.#borda = borda;
    return this;
  }

  async sync({
    headers,
    params,
    query,
  }: {
    params: Record<string, string>;
    query: Static<typeof Instant.SyncQuerySchema>;
    headers: Record<string, string | undefined>;
  }) {
    const { collection } = params;
    const { activity, synced } = query;

    const operator = activity === 'oldest' ? '$lt' : '$gt';

    const count = await this.#borda
      .query(collection)
      .sort({ _updated_at: activity === 'oldest' ? -1 : 1 })
      .filter({
        _updated_at: { [operator]: new Date(synced || new Date()) },
      })
      .count();

    const data = await this.#borda
      .query(collection)
      .sort({
        _updated_at: activity === 'oldest' ? -1 : 1,
      })
      .filter(synced ? { _updated_at: { [operator]: new Date(synced) } } : {})
      .limit(this.#size)
      .find({
        parse: {
          doc: false,
        },
      });

    const nextSynced = data[data.length - 1]?.['_updated_at'].toISOString();

    return {
      collection,
      count,
      activity,
      synced: nextSynced || synced || new Date().toISOString(),
      data: data.map((entry) => {
        const value = entry;

        const expiresAt = entry['_expires_at']?.toISOString();
        const updatedAt = entry['_updated_at'].toISOString();
        const createdAt = entry['_created_at'].toISOString();

        const status: InstantSyncStatus = expiresAt
          ? 'deleted'
          : updatedAt !== createdAt
          ? 'updated'
          : 'created';

        return {
          status,
          value,
        };
      }),
    } as InstantSyncResponse;
  }
}
