/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  AggregateOptions,
  BordaError,
  Document,
  DocumentResponse,
  ErrorCode,
  ExternalCollectionName,
  ExternalFieldName,
  InternalCollectionName,
  InternalFieldName,
  isEmpty,
  objectFieldsCreated,
  objectFieldsUpdated,
  QueryMethod,
} from '@borda/client';

import { newObjectId } from '../utils';
import { Cache } from './Cache';
import { Cloud } from './Cloud';
import {
  createFindCursor,
  createPipeline,
  queryHasMongoOperators,
} from './mongodb';
import {
  DocQRL,
  parseDoc,
  parseDocForInsertion,
  parseDocs,
  parseProjection,
  parseResponse,
} from './parse';
import { BordaServerQuery } from './query';

export async function aggregate({
  docQRL,
  inspect,
  cache,
  query,
  unlocked,
}: {
  docQRL: DocQRL;
  inspect: boolean;
  cache: Cache;
  query: (collection: string) => BordaServerQuery;
  unlocked: boolean;
}) {
  const { collection$, pipeline, filter, limit, skip, sort, options } = docQRL;

  const docs: Document[] = [];
  const pipe = createPipeline<Document>({
    filter: filter ?? {},
    pipeline: pipeline ?? ([] as any),
    limit: limit ?? 10000,
    skip: skip ?? 0,
    sort: sort ?? {},
  } as any);

  if (inspect) {
    console.log('pipeline', JSON.stringify(pipe, null, 2));
  }

  const cursor = collection$.aggregate<Document>(
    pipe,
    options as AggregateOptions
  );

  for await (const doc of cursor) {
    docs.push(doc);
  }

  return parseProjection(
    docQRL.projection ?? ({} as any),
    await parseDocs({ arr: docs, inspect, isUnlocked: unlocked, cache, query })(
      docQRL
    )
  );
}

export async function count({ docQRL }: { docQRL: DocQRL; inspect?: boolean }) {
  const { filter, collection$ } = docQRL;

  return collection$.countDocuments(filter || ({} as any)) as unknown as number;
}

export async function find<TSchema = Document>({
  docQRL,
  method,
  inspect,
  unlocked,
  cache,
  query,
  queryLimit,
}: {
  docQRL: DocQRL;
  method: QueryMethod;
  inspect: boolean;
  unlocked: boolean;
  cache: Cache;
  queryLimit: number;
  query: (collection: string) => BordaServerQuery;
}) {
  const docs: Document[] = [];

  /**
   * apply a hard limit if not set and only *if* locals env is not unlocked
   * also ensures that the limit being passed is not greater than the max one defined in the server instance
   */
  if (!docQRL.limit && !unlocked) {
    docQRL.limit = queryLimit;
  } else if (docQRL.limit && docQRL.limit > queryLimit && !unlocked) {
    docQRL.limit = queryLimit;
  }

  const cursor = createFindCursor(docQRL);
  await cursor.forEach((doc) => {
    docs.push(doc);
  });

  return (method === 'findOne'
    ? parseProjection(
        docQRL.projection ?? ({} as any),
        (await parseDoc({
          obj: docs[0],
          inspect,
          isUnlocked: unlocked,
          cache,
          query,
        })(docQRL)) ?? {}
      )
    : parseProjection(
        docQRL.projection ?? ({} as any),
        await parseDocs({
          arr: docs,
          inspect,
          isUnlocked: unlocked,
          cache,
          query,
        })(docQRL)
      ) ?? []) as unknown as DocumentResponse<TSchema>;
}

export async function insert({
  docQRL,
  request,
  unlocked,
  cloud,
}: {
  docQRL: DocQRL;
  inspect?: boolean;
  request?: Request & any;
  unlocked: boolean;
  cloud: Cloud;
}) {
  try {
    const { collection$, collection } = docQRL;

    let beforeSaveCallback: any = true;

    const beforeSave = cloud.getCloudTrigger(collection, 'beforeSave');

    if (beforeSave) {
      beforeSaveCallback = await beforeSave.fn({
        before: undefined,
        after: undefined,
        doc: docQRL.doc ?? undefined,
        qrl: docQRL,
        context: docQRL.options?.context ?? {},
        request,
      } as any);
    }

    if (
      beforeSaveCallback &&
      typeof beforeSaveCallback === 'object' &&
      beforeSaveCallback.doc
    ) {
      docQRL.doc = beforeSaveCallback.doc;
    }

    if (beforeSaveCallback) {
      /**
       * insert new documents
       */
      const d = parseDocForInsertion(docQRL.doc);
      const doc: Document = {
        ...d,
        _id: d._id ?? newObjectId(),
        _created_at: d._created_at ? d._created_at : new Date(),
      };

      if (docQRL?.options?.insert?.updatedAt !== false) {
        doc['_updated_at'] = d._updated_at ?? new Date();
      }

      const cursor = await collection$.insertOne(doc);

      if (cursor.acknowledged) {
        const afterSavePayload = parseResponse(
          {
            before: null,
            after: doc,
            doc,
            updatedFields: objectFieldsUpdated({}, doc),
            createdFields: objectFieldsCreated({}, doc),
          },
          {
            removeSensitiveFields: !unlocked,
          }
        );

        const afterSave = cloud.getCloudTrigger(collection, 'afterSave');
        if (afterSave) {
          afterSave.fn({
            ...afterSavePayload,
            qrl: docQRL,
            context: docQRL.options?.context ?? {},
            user: request?.session?.user,
            request,
          });
        }

        return afterSavePayload.doc;
      } else {
        return Promise.reject(
          new BordaError(
            ErrorCode.REST_DOCUMENT_NOT_CREATED,
            `could not create ${collection} document`
          )
        );
      }
    }

    /**
     * didn't pass the beforeSave trigger
     * but also doesn't mean it's an error
     */
    return {};
  } catch (err) {
    return Promise.reject(
      new BordaError(ErrorCode.REST_POST_ERROR, err as object).toJSON()
    );
  }
}

export async function insertMany({
  docQRL,
  unlocked,
  request,
  cloud,
}: {
  docQRL: DocQRL;
  inspect?: boolean;
  unlocked: boolean;
  request?: Request & any;
  cloud: Cloud;
}) {
  try {
    const { collection$, collection } = docQRL;
    let beforeSaveCallback: any = true;

    const beforeSave = cloud.getCloudTrigger(collection, 'beforeSaveMany');

    if (beforeSave) {
      beforeSaveCallback = await beforeSave.fn({
        before: undefined,
        after: undefined,
        doc: undefined,
        docs: docQRL.docs ?? undefined,
        qrl: docQRL,
        context: docQRL.options?.context ?? {},
        request,
      } as any);
    }

    if (
      beforeSaveCallback &&
      typeof beforeSaveCallback === 'object' &&
      beforeSaveCallback.docs
    ) {
      docQRL.docs = beforeSaveCallback.docs;
    }

    if (beforeSaveCallback) {
      /**
       * insert new documents
       */
      const docs: Document[] = [];

      docQRL.docs.map((d) => {
        const doc = parseDocForInsertion(d);

        if (docQRL?.options?.insert?.updatedAt !== false) {
          doc['_updated_at'] = d['_updated_at'] ?? new Date();
        }

        docs.push({
          ...doc,
          _id: doc._id ?? newObjectId(),
          _created_at: doc._created_at ?? new Date(),
        });
      });

      const cursor = await collection$.insertMany(docs);

      if (cursor.acknowledged) {
        const afterSavePayload = parseResponse(
          {
            before: null,
            after: docs,
            docs,
          },
          {
            removeSensitiveFields: !unlocked,
          }
        );

        const afterSave = cloud.getCloudTrigger(collection, 'afterSaveMany');
        if (afterSave) {
          afterSave.fn({
            ...afterSavePayload,
            qrl: docQRL,
            context: docQRL.options?.context ?? {},
            request,
          });
        }

        return cursor;
      } else {
        return Promise.reject(
          new BordaError(
            ErrorCode.REST_DOCUMENT_NOT_CREATED,
            `could not create ${collection} document`
          ).toJSON()
        );
      }
    }

    /**
     * didn't pass the beforeSave trigger
     * but also doesn't mean it's an error
     */
    return {};
  } catch (err) {
    return Promise.reject(
      new BordaError(ErrorCode.REST_POST_ERROR, err as object).toJSON()
    );
  }
}

export async function remove({
  docQRL,
  cache,
  unlocked,
  request,
  cloud,
}: {
  docQRL: DocQRL;
  inspect?: boolean;
  cache: Cache;
  unlocked: boolean;
  request?: Request & any;
  cloud: Cloud;
}) {
  const { collection, filter, collection$ } = docQRL;

  // @todo run beforeDelete

  const cursor = await collection$.findOneAndUpdate(
    filter || ({} as any),
    { $set: { _expires_at: new Date() } },
    {
      returnDocument: 'after',
      readPreference: 'primary',
    }
  );

  if (cursor.ok && cursor.value) {
    const afterDeletePayload = parseResponse(
      { before: cursor.value, doc: cursor.value, after: null },
      {
        removeSensitiveFields: !unlocked,
      }
    );
    const afterDelete = cloud.getCloudTrigger(collection, 'afterDelete');
    if (afterDelete) {
      afterDelete.fn({
        ...afterDeletePayload,
        qrl: docQRL,
        context: docQRL.options?.context ?? {},
        request,
      });
    }

    cache.invalidate({ collection, data: afterDeletePayload.before });
    return {};
  }
  if (!cursor.ok) {
    return Promise.reject(
      new BordaError(
        ErrorCode.REST_DOCUMENT_NOT_FOUND,
        `could not remove ${collection} document.`
      ).toJSON()
    );
  }
  return {};
}

export async function removeMany({
  docQRL,
  cache,
  unlocked,
  request,
  cloud,
}: {
  docQRL: DocQRL;
  inspect?: boolean;
  cache: Cache;
  unlocked: boolean;
  request?: Request & any;
  cloud: Cloud;
}) {
  const { collection, filter, collection$ } = docQRL;

  if (isEmpty(filter)) {
    return Promise.reject(
      new BordaError(
        ErrorCode.REST_DELETE_ERROR,
        `you must specify a filter to remove many ${collection} documents at once`
      ).toJSON()
    );
  }

  const updatedDocuments = await collection$
    .find(filter || ({} as any))
    .toArray();

  const cursor = await collection$.updateMany(
    filter || ({} as any),
    { $set: { _expires_at: new Date() } },
    {
      readPreference: 'primary',
    }
  );

  if (cursor.acknowledged) {
    // now we need to trigger afterDelete hooks
    const afterDelete = cloud.getCloudTrigger(collection, 'afterDelete');
    if (afterDelete) {
      updatedDocuments.map((doc) => {
        const afterDeletePayload = parseResponse(
          { before: doc, doc: doc, after: null },
          {
            removeSensitiveFields: !unlocked,
          }
        );

        afterDelete.fn({
          ...afterDeletePayload,
          qrl: docQRL,
          context: docQRL.options?.context ?? {},
          request,
        });
      });
    }

    // invalidate cache
    updatedDocuments.map((doc) => {
      cache.invalidate({ collection, data: doc });
    });

    return cursor;
  }

  return Promise.reject(
    new BordaError(
      ErrorCode.REST_DOCUMENT_NOT_FOUND,
      `could not remove many ${collection} documents`
    ).toJSON()
  );
}

export async function update({
  docQRL,
  cache,
  request,
  unlocked,
  cloud,
}: {
  docQRL: DocQRL;
  inspect?: boolean;
  cache: Cache;
  request?: Request & any;
  unlocked: boolean;
  cloud: Cloud;
}) {
  try {
    const { collection$, collection, filter } = docQRL;

    if (isEmpty(filter)) {
      return Promise.reject(
        new BordaError(
          ErrorCode.REST_POST_ERROR,
          `you must specify a filter to update a document in ${collection}`
        ).toJSON()
      );
    }

    const docBefore = await collection$.findOne(filter || ({} as any), {
      readPreference: 'primary',
    });

    let beforeSaveCallback: any = true;
    const beforeSave = cloud.getCloudTrigger(collection, 'beforeSave');

    if (beforeSave) {
      beforeSaveCallback = await beforeSave.fn({
        before: docBefore ?? undefined,
        after: undefined,
        doc: docQRL.doc ?? undefined,
        qrl: docQRL,
        context: docQRL.options?.context ?? {},
        request,
      } as any);
    }

    if (beforeSaveCallback) {
      if (
        beforeSaveCallback &&
        typeof beforeSaveCallback === 'object' &&
        beforeSaveCallback.doc
      ) {
        docQRL.doc = beforeSaveCallback.doc;
      }

      const d =
        docQRL?.options?.parse?.doc !== false
          ? parseDocForInsertion(docQRL.doc)
          : docQRL.doc;

      const doc: Document = {
        ...d,
      };

      /**
       * ensure each internal/external field is deleted from the user payload
       * if session is not unlocked
       */
      const reservedFields = [
        ...Object.keys(InternalFieldName),
        ...Object.keys(ExternalFieldName),
      ];

      if (!unlocked) {
        reservedFields.forEach((field) => {
          delete doc[field];
        });
      }

      let payload: any = {
        $set: doc,
      };

      // checks if doc has any prop starting with $ to allow update filter operators coming from the client
      if (queryHasMongoOperators(doc)) {
        payload = doc;
      } else {
        if (d._updated_at && unlocked) {
          payload['$set']['_updated_at'] = d._updated_at;
        }
        if (docQRL?.options?.update?.updatedAt !== false) {
          payload['$set']['_updated_at'] = new Date();
        }
      }

      const cursor = await collection$.findOneAndUpdate(
        filter || ({} as any),
        payload,
        {
          returnDocument: 'after',
          readPreference: 'primary',
        }
      );

      if (cursor.ok) {
        const docAfter = cursor.value ?? ({} as Document);
        const afterSavePayload = parseResponse(
          {
            before: docBefore,
            after: docAfter,
            doc: docQRL.doc,
            updatedFields: objectFieldsUpdated(docBefore, docAfter),
            createdFields: objectFieldsCreated(docBefore, docAfter),
          },
          {
            removeSensitiveFields: !unlocked,
          }
        );

        const afterSave = cloud.getCloudTrigger(collection, 'afterSave');

        if (afterSave) {
          afterSave.fn({
            ...afterSavePayload,
            qrl: docQRL,
            context: docQRL.options?.context ?? {},
            request,
          });
        }

        cache.invalidate({ collection, data: docAfter });
        return {};
      } else {
        return Promise.reject(
          new BordaError(
            ErrorCode.REST_DOCUMENT_NOT_UPDATED,
            `could not update ${collection} document`
          ).toJSON()
        );
      }
    }

    /**
     * didn't pass the beforeSave trigger
     * but also doesn't mean it's an error
     */
    return {};
  } catch (err) {
    return Promise.reject(
      new BordaError(ErrorCode.REST_POST_ERROR, err as object).toJSON()
    );
  }
}

export async function updateMany({
  docQRL,
  cache,
  unlocked,
}: {
  docQRL: DocQRL;
  inspect?: boolean;
  cache: Cache;
  unlocked: boolean;
}) {
  const { collection$, collection, filter } = docQRL;

  if (isEmpty(filter)) {
    return Promise.reject(
      new BordaError(
        ErrorCode.REST_DELETE_ERROR, // @todo fix this
        `you must specify a filter to update many ${collection} documents at once`
      ).toJSON()
    );
  }

  const d =
    docQRL?.options?.parse?.doc !== false
      ? parseDocForInsertion(docQRL.doc)
      : docQRL.doc;

  const doc: Document = {
    ...d,
  };

  /**
   * ensure each internal/external field is deleted from the user payload
   * if session is not unlocked
   */
  const reservedFields = [
    ...Object.keys(InternalFieldName),
    ...Object.keys(ExternalFieldName),
  ];

  if (!unlocked) {
    reservedFields.forEach((field) => {
      delete doc[field];
    });
  }

  let payload: any = {
    $set: doc,
  };

  // checks if doc has any prop starting with $ to allow update filter operators coming from the client
  if (queryHasMongoOperators(doc)) {
    payload = doc;
  } else {
    if (d._updated_at && unlocked) {
      payload['$set']['_updated_at'] = d._updated_at;
    }
    if (docQRL?.options?.update?.updatedAt !== false) {
      payload['$set']['_updated_at'] = new Date();
    }
  }

  const cursor = await collection$.updateMany(filter || ({} as any), payload, {
    readPreference: 'primary',
  });

  if (cursor.acknowledged) {
    // invalidate cache
    if (cache.enabled) {
      const updatedDocuments = await collection$
        .find(filter || ({} as any))
        .toArray();

      updatedDocuments.map((doc) => {
        cache.invalidate({ collection, data: doc });
      });
    }

    return cursor;
  } else {
    return Promise.reject(
      new BordaError(
        ErrorCode.REST_DOCUMENT_NOT_UPDATED,
        `could not update many ${collection} documents`
      ).toJSON()
    );
  }
}

export async function upsert({
  docQRL,
  cache,
  unlocked,
}: {
  docQRL: DocQRL;
  inspect?: boolean;
  cache: Cache;
  unlocked: boolean;
}) {
  const { collection$, collection, filter } = docQRL;

  if (isEmpty(filter)) {
    return Promise.reject(
      new BordaError(
        ErrorCode.REST_POST_ERROR,
        `you must specify a filter to update or insert ${collection} document`
      ).toJSON()
    );
  }

  const doc: Document = {
    ...parseDocForInsertion(docQRL.doc),
    _updated_at: new Date(),
  };

  /**
   * ensure each internal/external field is deleted from the user payload
   * if session is not unlocked
   */
  const reservedFields = [
    ...Object.keys(InternalFieldName),
    ...Object.keys(ExternalFieldName),
  ];

  if (!unlocked) {
    reservedFields.forEach((field) => {
      delete doc[field];
    });
  }

  const bulk = collection$.initializeUnorderedBulkOp({
    readPreference: 'primary',
  });

  bulk
    .find(filter ?? {})
    .upsert()
    .updateOne({
      $setOnInsert: { _id: newObjectId(), _created_at: new Date() },
      $set: doc,
    });

  const cursor = await bulk.execute();

  if (cursor.ok) {
    // invalidate cache
    if (cache.enabled) {
      const updatedDocuments = await collection$
        .find(filter || ({} as any))
        .toArray();

      updatedDocuments.map((doc) => {
        cache.invalidate({ collection, data: doc });
      });
    }

    return cursor;
  } else {
    return Promise.reject(
      new BordaError(
        ErrorCode.REST_DOCUMENT_NOT_UPDATED,
        `could not update or insert ${collection} document`
      ).toJSON()
    );
  }
}

export async function upsertMany({
  docQRL,
  cache,
  unlocked,
}: {
  docQRL: DocQRL;
  inspect?: boolean;
  cache: Cache;
  unlocked: boolean;
}) {
  const { collection$, collection, filter } = docQRL;

  if (isEmpty(filter)) {
    return Promise.reject(
      new BordaError(
        ErrorCode.REST_POST_ERROR,
        `you must specify a filter to update or insert many ${collection} documents at once. the value should be prefixed with $$ + the field to be compared to identify the field to update. eg: { email: $$email }`
      ).toJSON()
    );
  }

  if (!Array.isArray(docQRL.docs)) {
    return Promise.reject(
      new BordaError(
        ErrorCode.REST_POST_ERROR,
        `you must specify an array of documents to update or insert many ${collection} documents at once`
      ).toJSON()
    );
  }

  const docs: Document[] = docQRL.docs.map((doc) => ({
    ...parseDocForInsertion(doc),
    _updated_at: new Date(),
  }));

  /**
   * ensure each internal/external field is deleted from the user payload
   * if session is not unlocked
   */
  const reservedFields = [
    ...Object.keys(InternalFieldName),
    ...Object.keys(ExternalFieldName),
  ];

  if (!unlocked) {
    docs.forEach((doc) => {
      reservedFields.forEach((field) => {
        delete doc[field];
      });
    });
  }

  const bulk = collection$.initializeUnorderedBulkOp({
    readPreference: 'primary',
  });

  docs.forEach((doc) => {
    // create a condition based on the filter
    // if a filter has a value with $$ prefix, it means we want to compare the value of the field with the value of the field specified in the filter
    // eg: { email: $$email } means we want to compare the value of the email field with the value of the email field in the filter
    const filterPayload: any = filter;
    const condition = Object.keys(filterPayload).reduce(
      (acc: any, key: string) => {
        if (
          typeof filterPayload[key] === 'string' &&
          filterPayload[key].startsWith('$$')
        ) {
          acc[key] = doc[filterPayload[key].slice(2)];
        } else {
          acc[key] = filterPayload[key];
        }
        return acc;
      },
      {}
    );

    bulk
      .find(condition)
      .upsert()
      .updateOne({
        $setOnInsert: {
          _id: newObjectId(),
          _created_at: new Date(),
        },
        $set: doc,
      });
  });

  const cursor = await bulk.execute();

  if (cursor.ok) {
    // invalidate cache
    if (cache.enabled) {
      const updatedDocuments = await collection$
        .find(filter || ({} as any))
        .toArray();

      updatedDocuments.map((doc) => {
        cache.invalidate({ collection, data: doc });
      });
    }
    return cursor;
  } else {
    return Promise.reject(
      new BordaError(
        ErrorCode.REST_DOCUMENT_NOT_UPDATED,
        `could not update or insert many ${collection} documents`
      ).toJSON()
    );
  }
}

export async function get({
  docQRL,
  objectId,
  unlocked,
  cache,
  query,
  inspect,
}: {
  docQRL: DocQRL;
  objectId: string;
  inspect?: boolean;
  unlocked: boolean;
  cache: Cache;
  query: (collection: string) => BordaServerQuery;
}) {
  try {
    const { collection } = docQRL;
    const collectionName = collection;

    /**
     * query against to any of the reserved collections
     * if not unlocked should be strictly forbidden
     */
    const reservedCollections = [
      ...Object.keys(InternalCollectionName),
      ...Object.keys(ExternalCollectionName),
    ];

    if (!unlocked && reservedCollections.includes(collectionName)) {
      return Promise.reject(
        new BordaError(
          ErrorCode.QUERY_NOT_ALLOWED,
          `You can't execute the operation 'get' on '${
            ExternalCollectionName[collectionName] ?? collectionName
          }' because it's a reserved collection`
        ).toJSON()
      );
    }

    /**
     * @todo run beforeFind and afterFind hooks
     */
    const { collection$ } = docQRL;

    const doc = await collection$.findOne<Document>({
      _id: objectId as any,
    });

    return parseProjection(
      docQRL.projection ?? {},
      await parseDoc({
        obj: doc,
        cache,
        query,
        inspect: inspect ?? false,
        isUnlocked: unlocked,
      })(docQRL)
    );
  } catch (err) {
    return new BordaError(ErrorCode.REST_GET_ERROR, err as object).toJSON();
  }
}

export async function put({
  docQRL,
  objectId,
  request,
  unlocked,
  cache,
  cloud,
}: {
  docQRL: DocQRL;
  objectId: string;
  inspect?: boolean;
  unlocked?: boolean;
  request?: Request & any;
  cache: Cache;
  cloud: Cloud;
}) {
  try {
    const { doc, collection$ } = docQRL;
    const { collection } = docQRL;
    const collectionName = collection;

    const beforeSave = cloud.getCloudTrigger(collectionName, 'beforeSave');
    let beforeSaveCallback: any = true;
    let document = doc;

    const docBefore = await collection$.findOne(
      {
        _id: {
          $eq: objectId as any,
        },
      },
      {
        readPreference: 'primary',
      }
    );

    if (beforeSave) {
      beforeSaveCallback = await beforeSave.fn({
        before: docBefore ?? undefined,
        after: undefined,
        doc: document,
        qrl: docQRL,
        context: docQRL.options?.context ?? {},
        request,
      } as any);
    }

    if (
      beforeSaveCallback &&
      typeof beforeSaveCallback === 'object' &&
      beforeSaveCallback.doc
    ) {
      document = beforeSaveCallback.doc;
    }

    const d = parseDocForInsertion(document);
    document = {
      ...d,
    };

    /**
     * ensure each internal/external field is deleted from the user payload
     * if session is not unlocked
     */
    const reservedFields = [
      ...Object.keys(InternalFieldName),
      ...Object.keys(ExternalFieldName),
    ];

    // blocked access to reserved fields
    if (!unlocked) {
      reservedFields.forEach((field) => {
        delete document[field];
      });
    }

    if (docQRL?.options?.update?.updatedAt !== false) {
      document['_updated_at'] =
        d._updated_at && unlocked ? d._updated_at : new Date();
    }

    const cursor = await collection$.findOneAndUpdate(
      {
        _id: {
          $eq: objectId as any,
        },
      },
      {
        $set: document,
      },
      { returnDocument: 'after', readPreference: 'primary' }
    );

    if (cursor.ok) {
      if (cursor.value) {
        const docAfter = cursor.value ?? ({} as Document);
        const afterSavePayload = parseResponse(
          {
            before: docBefore,
            after: docAfter,
            doc: document,
            updatedFields: objectFieldsUpdated(docBefore, docAfter),
            createdFields: objectFieldsCreated(docBefore, docAfter),
          },
          {
            removeSensitiveFields: !unlocked,
          }
        );

        const afterSave = cloud.getCloudTrigger(collectionName, 'afterSave');
        if (afterSave) {
          afterSave.fn({
            ...afterSavePayload,
            qrl: docQRL,
            context: docQRL.options?.context ?? {},
            request,
          });
        }

        cache.invalidate({
          collection: collectionName,
          data: docAfter,
        });
        return {};
      } else {
        return Promise.reject(
          new BordaError(
            ErrorCode.REST_DOCUMENT_NOT_UPDATED,
            'document not found'
          ).toJSON()
        );
      }
    } else {
      return Promise.reject(
        new BordaError(
          ErrorCode.REST_DOCUMENT_NOT_UPDATED,
          'could not update document'
        ).toJSON()
      );
    }

    /**
     * didn't pass the beforeSave trigger
     * but also doesn't mean it's an error
     */
    return {};
  } catch (err) {
    return Promise.reject(
      new BordaError(ErrorCode.REST_GET_ERROR, err as object).toJSON()
    );
  }
}

export async function del({
  docQRL,
  objectId,
  request,
  unlocked,
  cache,
  cloud,
}: {
  docQRL: DocQRL;
  objectId: string;
  inspect?: boolean;
  unlocked?: boolean;
  request?: Request & any;
  cache: Cache;
  cloud: Cloud;
}) {
  try {
    const { collection$, collection } = docQRL;
    const collectionName = collection;
    /**
     * query against to any of the reserved collections
     * if not unlocked should be strictly forbidden
     */
    const reservedCollections = [
      ...Object.keys(InternalCollectionName),
      ...Object.keys(ExternalCollectionName),
    ];
    if (!unlocked && reservedCollections.includes(collectionName!)) {
      return Promise.reject(
        new BordaError(
          ErrorCode.QUERY_NOT_ALLOWED,
          `You can't execute the operation 'delete' on '${
            ExternalCollectionName[collectionName!] ?? collectionName
          }' because it's a reserved collection`
        ).toJSON()
      );
    }

    /**
     * @todo run beforeDelete
     */
    const qrl: Partial<DocQRL<any>> = {
      filter: {
        _id: {
          $eq: objectId,
        },
      },
    }; 

    const cursor = await collection$!.findOneAndUpdate(
      { ...qrl.filter },
      { $set: { _expires_at: new Date() } },
      {
        returnDocument: 'after',
        readPreference: 'primary',
      }
    );

    if (cursor.ok && cursor.value) {
      const afterDeletePayload = parseResponse(
        { before: cursor.value, doc: cursor.value, after: null },
        {
          removeSensitiveFields: !unlocked,
        }
      );

      const afterDelete = cloud.getCloudTrigger(
        collectionName as string,
        'afterDelete'
      );
      if (afterDelete) {
        afterDelete.fn({
          ...afterDeletePayload,
          qrl,
          context: docQRL.options?.context ?? {},
          request,
        });
      }

      cache.invalidate({ collection: collectionName, data: cursor.value });
      return {};
    } else {
      return Promise.reject(
        new BordaError(
          ErrorCode.REST_DOCUMENT_NOT_FOUND,
          'document not found'
        ).toJSON()
      );
    }
  } catch (err) {
    return Promise.reject(
      new BordaError(ErrorCode.REST_DELETE_ERROR, err as object).toJSON()
    );
  }
}
