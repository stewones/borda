import {
  Request,
  Response,
} from 'express';

import { Auth } from '@elegante/sdk';

export function passwordResetGet(req: Request, res: Response) {
  const { token } = req.query;
  if (!token) {
    return res.status(404).send(`
      <html>
        <head>
            <title>Invalid Token</title>
        </head>
        <body>
            invalid token
        </body>
      </html>  
      `);
  }
  return res.status(200).send(`
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
    `);
}

export async function passwordResetPost(req: Request, res: Response) {
  const { token, password } = req.body;
  if (!token) {
    return res.status(404).send(`
        <html>
        <head>
            <title>Missing Token</title>
        </head>
           <body>
                Token is missing
            </body>
        </html>  
        `);
  }

  try {
    await Auth.resetPassword(token, password);

    return res.status(201).send(`
        <html>
          <head>
             <title>Password successfully reset</title>
          </head>
           <body>
               Your password has been reset :)
            </body>
        </html>  
        `);
  } catch (err) {
    return res.status(400).send(`
        <html>
          <head>
             <title>Error resetting password</title>
          </head>
           <body>
               ${err.message}
            </body>
        </html>  
        `);
  }
}
