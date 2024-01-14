/**
 * @license
 * Copyright Elegante All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://elegante.dev/license
 */
import { print } from './log';
import { User } from './types';

export interface EmailProviderParams {
  to: {
    name: string;
    email: string;
  };
  subject: string;
  html: string;
}

export interface EmailProvider {
  send: (params: EmailProviderParams) => Promise<void>;
}

export function DefaultEmailProvider(): EmailProvider {
  return {
    send(params: EmailProviderParams) {
      print(`
          -------------------
          Email Provider Test
          -------------------   
          # to: ${params.to}
          # subject: ${params.subject}
          # html: ${params.html}    
      `);
      return Promise.resolve();
    },
  };
}

export interface EmailPasswordResetParams {
  user: User;
  token: string;
  baseUrl: string;
}

export interface EmailPasswordResetParamsCallback {
  subject: string;
  html: string;
}

export function DefaultEmailPasswordResetTemplate(
  params: EmailPasswordResetParams
): EmailPasswordResetParamsCallback {
  const { user, token, baseUrl } = params;
  return {
    subject: 'Password Reset',
    html: `
          <p>Hi ${user.name},</p>
          <p>Here is your password reset link:</p>
          <p>${baseUrl}/password/reset?token=${token}</p>
          <br />
          <br />
          <p>Best,</p>
          <p>Elegante.</p>
    `,
  };
}
