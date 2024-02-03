import { Db } from 'mongodb';

/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  BordaError,
  ErrorCode,
  ExternalCollectionName,
  InternalCollectionName,
  InternalHeaders,
  isEmpty,
  Password,
  PluginHook,
  pointer,
  QueryMethod,
  Session,
  User,
  validateEmail,
} from '@borda/sdk';

import {
  CloudTriggerCallback,
  getCloudBeforeSignUpTrigger,
} from '../lib_elegante';
import { newToken } from '../utils/crypto';
import { compare, hash, validate } from '../utils/password';
import { BordaQuery } from './Borda';
import { Cache } from './Cache';
import {
  aggregate,
  count,
  find,
  get,
  insert,
  insertMany,
  put,
  remove,
  removeMany,
  update,
  updateMany,
  upsert,
  upsertMany,
} from './operation';
import { DocQRL, DocQRLFrom, parseQuery, parseResponse } from './parse';
import { createSession } from './server';

export function restPost({
  params,
  request,
  body,
  db,
  query,
  plugin,
  cache,
  serverHeaderPrefix,
  serverURL,
}: {
  params: any;
  request: Request & any;
  body: any;
  db: Db;
  query: (collection: string) => BordaQuery;
  plugin: (name: PluginHook) => ((params?: any) => any) | undefined;
  cache: Cache;
  serverHeaderPrefix: string;
  serverURL: string;
}) {
  try {
    const inspect = request.inspect;
    const unlocked = request.unlocked;

    const collectionName =
      InternalCollectionName[params['collectionName']] ??
      params['collectionName'];

    const method = request.headers.get(
      `${serverHeaderPrefix}-${InternalHeaders['apiMethod']}`
    ) as QueryMethod;

    if (!method) {
      return Promise.reject(
        new BordaError(
          ErrorCode.REST_METHOD_REQUIRED,
          'Method required'
        ).toJSON()
      );
    }

    /**
     * query against to any of the reserved collections
     * if not unlocked should be strictly forbidden
     */
    const reservedCollections = [
      ...Object.keys(InternalCollectionName),
      ...Object.keys(ExternalCollectionName),
    ];

    if (
      ![
        'signIn',
        'signUp',
        'updateEmail',
        'updatePassword',
        'passwordForgot',
        'passwordReset',
      ].includes(method) &&
      !unlocked &&
      reservedCollections.includes(collectionName)
    ) {
      return Promise.reject(
        new BordaError(
          ErrorCode.QUERY_NOT_ALLOWED,
          `You can't execute the operation '${method}' on '${
            ExternalCollectionName[collectionName] ?? collectionName
          }' because it's a reserved collection`
        ).toJSON()
      );
    }

    const docQRLFrom: DocQRLFrom = {
      ...body,
      method,
      collection: collectionName,
    };

    const docQRL = parseQuery({
      from: docQRLFrom,
      db,
      inspect,
    });

    if (['find', 'findOne'].includes(method)) {
      return find({
        docQRL,
        method,
        inspect,
        unlocked,
        cache,
        query,
      });
    }

    if (['update'].includes(method)) {
      return update({
        docQRL,
        inspect,
        cache,
        unlocked,
      });
    }

    if (['updateMany'].includes(method)) {
      return updateMany({
        docQRL,
        inspect,
        cache,
        unlocked,
      });
    }

    if (['remove'].includes(method)) {
      return remove({
        docQRL,
        inspect,
        cache,
        unlocked,
        request,
      });
    }

    if (['removeMany'].includes(method)) {
      return removeMany({
        docQRL,
        inspect,
        cache,
        unlocked,
        request,
      });
    }

    if (['count'].includes(method)) {
      return count({
        docQRL,
        inspect,
      });
    }

    if (['aggregate'].includes(method)) {
      return aggregate({
        docQRL,
        inspect,
        cache,
        query,
        unlocked,
      });
    }

    if (['insert'].includes(method)) {
      return insert({
        docQRL,
        request,
        unlocked,
      });
    }

    if (['insertMany'].includes(method)) {
      return insertMany({
        docQRL,
        request,
        unlocked,
      });
    }

    if (['upsert'].includes(method)) {
      return upsert({
        docQRL,
        cache,
        unlocked,
      });
    }

    if (['upsertMany'].includes(method)) {
      return upsertMany({
        docQRL,
        cache,
        unlocked,
      });
    }

    if (collectionName === '_User' && method === 'signUp') {
      return restUserSignUp({
        docQRL,
        request,
        query,
      });
    }

    if (collectionName === '_User' && method === 'signIn') {
      return restUserSignIn({
        docQRL,
        query,
      });
    }

    if (collectionName === '_User' && method === 'updateEmail') {
      if (!request.session) {
        return Promise.reject(
          new BordaError(
            ErrorCode.AUTH_INVALID_SESSION,
            'Session required'
          ).toJSON()
        );
      }
      return restUserUpdateEmail({
        docQRL,
        request,
        cache,
        query,
      });
    }

    if (collectionName === '_User' && method === 'updatePassword') {
      if (!request.session) {
        return Promise.reject(
          new BordaError(
            ErrorCode.AUTH_INVALID_SESSION,
            'Session required'
          ).toJSON()
        );
      }
      return restUserUpdatePassword({
        docQRL,
        request,
        cache,
        query,
      });
    }

    if (collectionName === '_User' && method === 'passwordForgot') {
      return restUserForgotPassword({
        docQRL,
        query,
        serverURL,
        plugin,
      });
    }

    if (collectionName === '_User' && method === 'passwordReset') {
      return restUserResetPassword({
        docQRL,
        query,
      });
    }

    return Promise.reject(
      new BordaError(
        ErrorCode.REST_METHOD_NOT_FOUND,
        'rest method not found'
      ).toJSON()
    );
  } catch (err) {
    return Promise.reject(
      new BordaError(ErrorCode.REST_POST_ERROR, err as object).toJSON()
    );
  }
}

export function restPut({
  params,
  request,
  body,
  db,
  cache,
}: {
  params: any;
  request: Request & any;
  body: any;
  db: Db;
  cache: Cache;
}) {
  try {
    const inspect = request.inspect;
    const unlocked = request.unlocked;

    const { doc, options } = body;
    const { objectId } = params;

    const collectionName =
      InternalCollectionName[params['collectionName']] ??
      params['collectionName'];

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
          `You can't execute the operation 'put' on '${
            ExternalCollectionName[collectionName] ?? collectionName
          }' because it's a reserved collection`
        ).toJSON()
      );
    }

    const docQRLFrom: DocQRLFrom = {
      doc,
      method: 'put',
      collection: collectionName,
      options,
    };

    const docQRL = parseQuery({
      from: docQRLFrom,
      db,
      inspect,
    });

    // call the operation
    return put({
      docQRL,
      objectId,
      inspect,
      unlocked,
      cache,
      request,
    });
  } catch (err) {
    return Promise.reject(
      new BordaError(ErrorCode.REST_POST_ERROR, err as object).toJSON()
    );
  }
}

export function restGet({
  params,
  request,
  db,
  query,
  cache,
  q,
}: {
  params: any;
  request: Request & any;
  db: Db;
  query: any;
  cache: Cache;
  q: (collection: string) => BordaQuery;
}) {
  try {
    const inspect = request.inspect;
    const unlocked = request.unlocked;

    const { include, exclude } = query;

    const { objectId } = params;

    const collectionName =
      InternalCollectionName[params['collectionName']] ??
      params['collectionName'];

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

    const docQRLFrom: DocQRLFrom = {
      include,
      exclude,
      method: 'get',
      collection: collectionName,
    };

    const docQRL = parseQuery({
      from: docQRLFrom,
      db,
      inspect,
    });

    // call the operation
    return get({
      docQRL,
      objectId,
      unlocked,
      inspect,
      cache,
      query: q,
    });
  } catch (err) {
    return Promise.reject(
      new BordaError(ErrorCode.REST_GET_ERROR, err as object).toJSON()
    );
  }
}

export async function restUserSignUp({
  docQRL,
  request,
  query,
}: {
  docQRL: DocQRL;
  inspect?: boolean;
  request?: Request & any;
  query: (collection: string) => BordaQuery;
}) {
  try {
    const { projection, include, exclude, doc } = docQRL;

    const { name, email, password } = doc ?? {};

    /**
     * validation chain
     */
    if (!name) {
      return Promise.reject(
        new BordaError(ErrorCode.AUTH_NAME_REQUIRED, 'Name required').toJSON()
      );
    } else if (!validateEmail(email)) {
      return Promise.reject(
        new BordaError(ErrorCode.AUTH_INVALID_EMAIL, 'Invalid email address')
      );
    } else if (!password) {
      return Promise.reject(
        new BordaError(
          ErrorCode.AUTH_PASSWORD_REQUIRED,
          'The password is incorrect'
        ).toJSON()
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const valid = (await validate(password, { details: true })) as any[];
    const validation = valid.map((v) => v.message);
    if (validation.length > 0) {
      return Promise.reject(
        new BordaError(
          ErrorCode.AUTH_PASSWORD_INCORRECT,
          validation[0]
        ).toJSON()
      );
    }

    const checkUserExists = await query('User')
      .projection({ email: 1 })
      .filter({
        email: {
          $eq: email,
        },
        expiresAt: {
          $exists: false,
        },
      })
      .findOne();

    if (!isEmpty(checkUserExists)) {
      return Promise.reject(
        new BordaError(
          ErrorCode.AUTH_EMAIL_ALREADY_EXISTS,
          'This email is already in use'
        ).toJSON()
      );
    }

    // run beforeSignUp hooks
    let beforeSignUpCallback: CloudTriggerCallback = true;
    const beforeSignUp = getCloudBeforeSignUpTrigger();
    if (beforeSignUp) {
      beforeSignUpCallback = await beforeSignUp.fn({
        before: undefined,
        after: undefined,
        doc: docQRL.doc ?? undefined,
        qrl: docQRL,
        context: docQRL.options?.context ?? {},
        request,
      } as any);
    }

    if (beforeSignUpCallback) {
      if (
        beforeSignUpCallback &&
        typeof beforeSignUpCallback === 'object' &&
        beforeSignUpCallback.doc
      ) {
        docQRL.doc = beforeSignUpCallback.doc;
      }
    }

    const newUser = (await query('User').insert({
      name,
      ...docQRL.doc,
      email: email.toLowerCase(),
      password: await hash(password),
    })) as User;

    const currentUser = (await query('User')
      .projection(
        !isEmpty(projection)
          ? {
              ...projection,
              objectId: 1,
            }
          : ({} as any)
      )
      .include(include ?? [])
      .exclude(exclude ?? [])
      .filter({
        objectId: newUser.objectId,
        expiresAt: {
          $exists: false,
        },
      })
      .findOne()) as User;

    return await createSession({
      user: currentUser,
      query,
    });
  } catch (err) {
    return Promise.reject(err);
  }
}

export async function restUserSignIn({
  docQRL,
  query,
}: {
  docQRL: DocQRL;
  inspect?: boolean;
  query: (collection: string) => BordaQuery;
}) {
  const { projection, include, exclude, doc } = docQRL;
  const { email, password } = doc ?? {};
  /**
   * validation chain
   */
  if (!validateEmail(email)) {
    return Promise.reject(
      new BordaError(
        ErrorCode.AUTH_INVALID_EMAIL,
        'Invalid email address'
      ).toJSON()
    );
  } else if (!password) {
    return Promise.reject(
      new BordaError(
        ErrorCode.AUTH_PASSWORD_INCORRECT,
        'The password is incorrect'
      ).toJSON()
    );
  }

  const user = (await query('User')
    .projection(
      !isEmpty(projection)
        ? {
            ...projection,
            password: 1,
            objectId: 1,
          }
        : // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ({} as any)
    )
    .include(include ?? [])
    .exclude(exclude ?? [])
    .filter({
      email: {
        $eq: email,
      },
      expiresAt: {
        $exists: false,
      },
    })
    .findOne()) as User;

  if (isEmpty(user)) {
    return Promise.reject(
      new BordaError(ErrorCode.AUTH_EMAIL_NOT_FOUND, 'User not found').toJSON()
    );
  }

  if (!(await compare(password, user.password ?? ''))) {
    return Promise.reject(
      new BordaError(
        ErrorCode.AUTH_PASSWORD_INCORRECT,
        'The password is incorrect'
      ).toJSON()
    );
  }

  const session = await createSession({
    user,
    query,
  });

  return session;
}

export async function restUserSignOut({
  request,
  query,
}: {
  request: Request & { session: Session };
  query: (collection: string) => BordaQuery;
}) {
  try {
    const { session } = request;
    await query('Session').delete(session.objectId);
    return {};
  } catch (err) {
    return Promise.reject(
      new BordaError(ErrorCode.AUTH_SIGN_OUT_ERROR, err as object).toJSON()
    );
  }
}

export async function restUserUpdateEmail({
  docQRL,
  query,
  request,
  cache,
}: {
  docQRL: DocQRL;
  request: Request & { session: Session };
  inspect?: boolean;
  cache: Cache;
  query: (collection: string) => BordaQuery;
}) {
  const { projection, include, exclude, doc } = docQRL;

  const { email, password } = doc ?? {};

  const { session } = request;
  const { user } = session;

  /**
   * validation chain
   */
  if (!validateEmail(email)) {
    return Promise.reject(
      new BordaError(
        ErrorCode.AUTH_INVALID_EMAIL,
        'Invalid email address'
      ).toJSON()
    );
  } else if (!password) {
    return Promise.reject(
      new BordaError(
        ErrorCode.AUTH_PASSWORD_INCORRECT,
        'The password is incorrect'
      ).toJSON()
    );
  }

  const checkIfEmailExists = (await query('User')
    .projection({ email: 1 })
    .filter({
      email: {
        $eq: email,
      },
      expiresAt: {
        $exists: false,
      },
    })
    .findOne()) as User;

  if (!isEmpty(checkIfEmailExists)) {
    return Promise.reject(
      new BordaError(
        ErrorCode.AUTH_EMAIL_ALREADY_EXISTS,
        'This email is already in use'
      ).toJSON()
    );
  }

  const currentUser = (await query('User')
    .projection(
      !isEmpty(projection)
        ? {
            ...projection,
            password: 1,
            objectId: 1,
          }
        : // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ({} as any)
    )
    .include(include ?? [])
    .exclude(exclude ?? [])
    .filter({
      email: {
        $eq: user.email,
      },
      expiresAt: {
        $exists: false,
      },
    })
    .findOne()) as User;

  if (isEmpty(currentUser)) {
    return Promise.reject(
      new BordaError(
        ErrorCode.AUTH_EMAIL_NOT_FOUND,
        `This email doesn't exist`
      ).toJSON()
    );
  }

  if (!(await compare(password, currentUser.password ?? ''))) {
    return Promise.reject(
      new BordaError(
        ErrorCode.AUTH_PASSWORD_INCORRECT,
        'The password is incorrect'
      ).toJSON()
    );
  }

  await query('User').update(currentUser.objectId, {
    email: email.toLowerCase(),
  });

  // invalidate all sessions
  // @todo use deleteMany?
  const sessions = (await query('Session')
    .filter({
      user: pointer('User', currentUser.objectId),
    })
    .find()) as Session[];

  for (const session of sessions) {
    await query('Session').delete(session.objectId);
  }

  // invalidate all cached users
  cache.invalidate({
    collection: '_User',
    objectId: currentUser.objectId,
  });

  const newSession = await createSession({
    user: currentUser,
    query,
  });

  newSession.user = { ...currentUser, email: email.toLowerCase() };

  return newSession;
}

export async function restUserUpdatePassword({
  docQRL,
  query,
  request,
  cache,
}: {
  docQRL: DocQRL;
  request: Request & { session: Session };
  inspect?: boolean;
  cache: Cache;
  query: (collection: string) => BordaQuery;
}) {
  const { projection, include, exclude, doc } = docQRL;
  const { currentPassword, newPassword } = doc ?? {};
  const { session } = request;
  const { user } = session;

  /**
   * validation chain
   */
  if (!currentPassword || !newPassword) {
    return Promise.reject(
      new BordaError(
        ErrorCode.AUTH_PASSWORD_REQUIRED,
        'Password is required'
      ).toJSON()
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const valid = (await validate(newPassword, { details: true })) as any[];
  const validation = valid.map((v) => v.message);
  if (validation.length > 0) {
    return Promise.reject(
      new BordaError(ErrorCode.AUTH_PASSWORD_INCORRECT, validation[0]).toJSON()
    );
  }

  const currentUser = (await query('User')
    .projection(
      !isEmpty(projection)
        ? {
            ...projection,
            password: 1,
            objectId: 1,
          }
        : // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ({} as any)
    )
    .include(include ?? [])
    .exclude(exclude ?? [])
    .filter({
      email: {
        $eq: user.email,
      },
      expiresAt: {
        $exists: false,
      },
    })
    .findOne()) as User;

  if (isEmpty(currentUser)) {
    return Promise.reject(
      new BordaError(
        ErrorCode.AUTH_USER_NOT_FOUND,
        `This user doesn't exist`
      ).toJSON()
    );
  }

  if (!(await compare(currentPassword, currentUser.password ?? ''))) {
    return Promise.reject(
      new BordaError(
        ErrorCode.AUTH_PASSWORD_INCORRECT,
        'Current password is incorrect'
      ).toJSON()
    );
  }

  if (await compare(newPassword, currentUser.password ?? '')) {
    return Promise.reject(
      new BordaError(
        ErrorCode.AUTH_PASSWORD_ALREADY_EXISTS,
        'The new password must be different from the current password'
      ).toJSON()
    );
  }

  const newPasswordHashed = await hash(newPassword);

  // check for password history
  const passwordHistory = (await query('Password')
    .filter({
      user: pointer('User', currentUser.objectId),
      type: 'history',
    })
    .limit(5)
    .sort({ createdAt: -1 })
    .find()) as Password[];

  for (const history of passwordHistory) {
    if (await compare(newPassword, history.password ?? '')) {
      return Promise.reject(
        new BordaError(
          ErrorCode.AUTH_PASSWORD_ALREADY_EXISTS,
          'The new password must be different from the last used ones.'
        ).toJSON()
      );
    }
  }

  // update user's password
  await query('User').update(currentUser.objectId, {
    password: newPasswordHashed,
  });

  // include to password history
  (await query('Password').insert({
    user: pointer('User', currentUser.objectId),
    password: newPasswordHashed,
    type: 'history',
    expiresAt: new Date(
      Date.now() + 1000 * 60 * 60 * 24 * 365 * 2
    ).toISOString(), // expires in 2 years
  })) as Password;

  // invalidate all sessions
  // @todo use deleteMany?
  const sessions = (await query('Session')
    .filter({
      user: pointer('User', currentUser.objectId),
    })
    .find()) as Session[];
  for (const session of sessions) {
    await query('Session').delete(session.objectId);
  }

  // invalidate all cached users
  cache.invalidate({ collection: '_User', objectId: currentUser.objectId });

  const newSession = await createSession({
    user: currentUser,
    query,
  });

  return newSession;
}

export async function restUserForgotPassword({
  docQRL,
  query,
  plugin,
  serverURL,
}: {
  docQRL: DocQRL;
  inspect?: boolean;
  query: (collection: string) => BordaQuery;
  plugin: (name: PluginHook) => ((params?: any) => any) | undefined;
  serverURL: string;
}) {
  const { projection, include, exclude, doc } = docQRL;
  const { email } = doc ?? {};

  /**
   * validation chain
   */
  if (!validateEmail(email)) {
    return Promise.reject(
      new BordaError(
        ErrorCode.AUTH_INVALID_EMAIL,
        'Invalid email address'
      ).toJSON()
    );
  }

  const currentUser = (await query('User')
    .projection(
      !isEmpty(projection)
        ? {
            ...projection,
            password: 1,
            objectId: 1,
          }
        : // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ({} as any)
    )
    .include(include ?? [])
    .exclude(exclude ?? [])
    .filter({
      email: {
        $eq: email,
      },
      expiresAt: {
        $exists: false,
      },
    })
    .findOne()) as User;

  if (isEmpty(currentUser)) {
    return {};
  }

  // include to password history
  const t = newToken();

  (await query('Password').insert({
    user: pointer('User', currentUser.objectId),
    type: 'forgot',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // expires in 1h
    token: t,
    email,
  })) as Password;

  // send email
  const EmailProviderPlugin = plugin('EmailProvider');
  const EmailPasswordResetTemplate = plugin('EmailPasswordResetTemplate');

  if (!EmailProviderPlugin || !EmailPasswordResetTemplate) {
    return Promise.reject(
      'email provider or password reset template not found'
    );
  }

  const emailTemplate = EmailPasswordResetTemplate({
    user: currentUser,
    token: t,
    baseUrl: serverURL,
  });

  try {
    await EmailProviderPlugin().send({
      to: {
        email: currentUser.email,
        name: currentUser.name,
      },
      subject: emailTemplate.subject,
      html: emailTemplate.html,
    });

    return {};
  } catch (err) {
    return Promise.reject(
      new BordaError(
        ErrorCode.SERVER_PROVIDER_ERROR,
        `EmailPluginProvider: ${err}`
      ).toJSON()
    );
  }
}

export async function restUserResetPassword({
  docQRL,
  query,
}: {
  docQRL: DocQRL;
  query: (collection: string) => BordaQuery;
}) {
  const { doc } = docQRL;
  const { token, password } = doc ?? {};

  /**
   * validation chain
   */
  if (!password) {
    return Promise.reject(
      new BordaError(
        ErrorCode.AUTH_PASSWORD_REQUIRED,
        'password required'
      ).toJSON()
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const valid = (await validate(password, { details: true })) as any[];
  const validation = valid.map((v) => v.message);
  if (validation.length > 0) {
    return Promise.reject(
      new BordaError(ErrorCode.AUTH_PASSWORD_INCORRECT, validation[0]).toJSON()
    );
  }

  const p = (await query('Password')
    .include(['user'])
    .filter({
      type: 'forgot',
      token,
    })
    .findOne()) as Password;

  if (isEmpty(p)) {
    return Promise.reject(
      new BordaError(
        ErrorCode.AUTH_PASSWORD_TOKEN_INCORRECT,
        'Invalid token. Please try again with a new password reset link.'
      ).toJSON()
    );
  }

  const { user } = p;

  // check for password history
  const passwordHistory = (await query('Password')
    .filter({
      user: pointer('User', user.objectId),
      type: 'history',
    })
    .limit(5)
    .sort({ createdAt: -1 })
    .find()) as Password[];

  for (const history of passwordHistory) {
    if (await compare(password, history.password ?? '')) {
      return Promise.reject(
        new BordaError(
          ErrorCode.AUTH_PASSWORD_ALREADY_EXISTS,
          'The new password must be different from the last used ones.'
        ).toJSON()
      );
    }
  }

  // update user's password
  const newPasswordHashed = await hash(password);
  await query('User').update(user.objectId, {
    password: newPasswordHashed,
  });

  // include to password history
  (await query('Password').insert({
    user: pointer('User', user.objectId),
    password: newPasswordHashed,
    type: 'history',
    expiresAt: new Date(
      Date.now() + 1000 * 60 * 60 * 24 * 365 * 2
    ).toISOString(), // expires in 2 years
  })) as Password;

  // invalidate all sessions
  const sessions = (await query('Session')
    .filter({
      user: pointer('User', user.objectId),
    })
    .find()) as Session[];

  for (const session of sessions) {
    await query('Session').delete(session.objectId);
  }

  return {};
}

export async function restUserMe({
  request,
}: {
  request: Request & { session: Session };
}) {
  console.log(123, request);
  const { session } = request;
  const { user } = session;

  return parseResponse(user, {
    removeSensitiveFields: true,
  });
}
