import { Response } from 'express';

import {
  EleganteError,
  EmailPasswordResetParams,
  EmailPasswordResetParamsCallback,
  EmailProvider,
  ErrorCode,
  getPluginHook,
  isEmpty,
  Password,
  pointer,
  query,
  User,
  validateEmail,
} from '@elegante/sdk';

import { DocQRL } from './parseQuery';
import { EleganteServer } from './Server';
import { newToken } from './utils';

export async function restPostPasswordForgot({
  res,
  docQRL,
}: {
  docQRL: DocQRL;
  res: Response;
}) {
  const { projection, include, exclude, doc } = docQRL;
  const { email } = doc ?? {};

  /**
   * validation chain
   */
  if (!validateEmail(email)) {
    return res
      .status(400)
      .json(
        new EleganteError(ErrorCode.AUTH_INVALID_EMAIL, 'Invalid email address')
      );
  }

  const currentUser = await query<User>('User')
    .unlock()
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
    .findOne();

  if (isEmpty(currentUser)) {
    return res.status(200).send();
  }

  // include to password history
  const t = newToken();
  await query<Password>('Password')
    .unlock()
    .insert({
      user: pointer('User', currentUser.objectId),
      type: 'forgot',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // expires in 1h
      token: t,
      email,
    });

  // send email
  const EmailProviderPlugin = getPluginHook<EmailProvider>('EmailProvider');
  const EmailPasswordResetTemplate = getPluginHook<
    EmailPasswordResetParams,
    EmailPasswordResetParamsCallback
  >('EmailPasswordResetTemplate');

  const { params } = EleganteServer;

  let baseUrl: string | string[] = params.serverURL.split('/');
  baseUrl.pop();
  baseUrl = baseUrl.join('/');

  const emailTemplate = EmailPasswordResetTemplate({
    user: currentUser,
    token: t,
    baseUrl,
  });

  try {
    await EmailProviderPlugin().send({
      to: currentUser.email,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
    });

    return res.status(201).send();
  } catch (err) {
    return res
      .status(500)
      .json(
        new EleganteError(
          ErrorCode.SERVER_PROVIDER_ERROR,
          `EmailPluginProvider: ${err}`
        )
      );
  }
}
