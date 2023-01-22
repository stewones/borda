export function passwordResetGet(req, res) {
  const token = req.query.token;
  if (!token) {
    return res.status(200).send(`
      <html>
         <body>
              invalid token
          </body>
      </html>  
      `);
  }
  return res.status(200).send(`
    <html>
       <body>
            <form action="/server/passwordReset" method="POST">
                <input type="hidden" name="token" value="${token}" />
                <input type="password" name="password" placeholder="new password" />
                <input type="submit" value="Reset Password" />
            </form>
        </body>
    </html>  
    `);
}

export function passwordResetPost(req, res) {
  const token = req.body.token;
  if (!token) {
    return res.status(200).send(`
        <html>
           <body>
                invalid token
            </body>
        </html>  
        `);
  }
  return res.status(200).send(`
      <html>
         <body>
             Your password has been reset :)
          </body>
      </html>  
      `);
}
