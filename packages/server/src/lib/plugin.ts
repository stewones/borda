import {
  EmailPasswordResetParams,
  EmailPasswordResetParamsCallback,
  EmailProvider,
  EmailProviderParams,
} from '@borda/sdk';

export interface ServerPlugin {
  name: string;
  version: string;
  EmailProvider?: () => EmailProvider;
  EmailPasswordResetTemplate?: (
    params: EmailPasswordResetParams
  ) => EmailPasswordResetParamsCallback;
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
