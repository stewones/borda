import { borda } from '../';

export function passwordResetGet({ set, query }: { set: any; query: any }) {
  const { token } = query;
  if (!token) {
    set.status = 404;

    return `
      <html>
        <head>
            <title>Invalid Token</title>
        </head>
        <body>
            invalid token
        </body>
      </html>  
      `;
  }
  set.status = 200;
  return `
    <html>
       <head>
            <title>Reset Password</title>
       </head>
       <body>
            <form action="/password/reset" method="POST">
                <input type="hidden" name="token" value="${token}" />
                <input type="password" name="password" placeholder="new password" />
                <input type="submit" value="Reset Password" />
            </form>
        </body>
    </html>  
    `;
}

export async function passwordResetPost({
  set,
  body,
}: {
  set: any;
  body: any;
}) {
  const { token, password } = body;
  if (!token) {
    set.status = 404;
    return `
        <html>
        <head>
            <title>Missing Token</title>
        </head>
           <body>
                Token is missing
            </body>
        </html>  
        `;
  }

  try {
    await borda.auth.resetPassword(token, password);

    set.status = 201;
    return `
        <html>
          <head>
             <title>Password successfully reset</title>
          </head>
           <body>
               Your password has been reset :)
            </body>
        </html>  
        `;
  } catch ({ data }: any) {
    set.status = 400;
    return `
        <html>
          <head>
             <title>Error resetting password</title>
          </head>
           <body>
               ${data.message}
            </body>
        </html>  
        `;
  }
}
