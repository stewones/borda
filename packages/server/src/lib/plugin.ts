import { User } from '@borda/client';

export type PluginHook = 'EmailProvider' | 'EmailPasswordResetTemplate';
export interface EmailProviderParams {
  to: {
    name: string;
    email: string;
  };
  subject: string;
  html: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  request?: any | null;
}
export interface EmailProvider {
  send: (params: EmailProviderParams) => Promise<void>;
}

export interface EmailPasswordResetParams {
  user: User;
  token: string;
  baseUrl: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  request?: any | null;
}

export interface EmailPasswordResetParamsCallback {
  subject: string;
  html: string;
}

export interface ServerPlugin {
  name: string;
  version: string;
  EmailProvider?: () => EmailProvider;
  EmailPasswordResetTemplate?:
    | ((params: EmailPasswordResetParams) => EmailPasswordResetParamsCallback)
    | ((
        params: EmailPasswordResetParams
      ) => Promise<EmailPasswordResetParamsCallback>);
}

export function BordaEmailPlugin(): EmailProvider {
  return {
    send(params: EmailProviderParams) {
      console.log(`
            -------------------
            Email Provider Test
            -------------------   
            # to: ${params.to.name} <${params.to.email}>
            # subject: ${params.subject}
            # html: ${params.html}    
        `);
      return Promise.resolve();
    },
  };
}

export function BordaEmailPasswordResetTemplatePlugin(
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
      `,
  };
}
