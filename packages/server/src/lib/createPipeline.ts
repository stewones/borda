import { isEmpty, Document, FilterOperations, Sort } from '@elegante/sdk';
import { parseFilter } from './parseFilter';

/**
 * allowed operators for watch (query.on())
 * see https://www.mongodb.com/docs/manual/reference/method/Mongo.watch/#mongodb-method-Mongo.watch
 *
 * @export
 * @template TSchema
 * @param {{
 *   filter: FilterOperations<TSchema>;
 *   pipeline: Document[];
 *   projection: Partial<{
 *     [key in keyof TSchema]: number;
 *   }>;
 *   sort?: Sort;
 *   limit?: number;
 *   skip?: number;
 * }} bridge
 * @returns {*}
 */
export function createPipeline<TSchema>(bridge: {
  filter: FilterOperations<TSchema>;
  pipeline?: Document[] | undefined;
  projection: Partial<{
    [key in keyof TSchema]: number;
  }>;
  sort?: Sort;
  limit?: number;
  skip?: number;
}) {
  const { filter, pipeline, sort, projection, limit, skip } = bridge;
  return [
    ...(!isEmpty(filter) ? [{ $match: parseFilter(filter) }] : []),
    ...parseFilter(pipeline),
    ...(!isEmpty(sort) ? [{ $sort: sort }] : []),
    ...(!isEmpty(projection) ? [{ $project: projection }] : []),
    ...(typeof limit === 'number' ? [{ $limit: limit }] : []),
    ...(typeof skip === 'number' ? [{ $skip: skip }] : []),
  ];
}
