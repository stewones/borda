# Borda

Borda is a cross-platform application stack that leverages the power of bun and mongodb, with all bateries included.

# Packages

| Name           | Version | Platform      |
| -------------- | ------- | ------------- |
| @borda/server  | 0.0.1   | `bun`         |
| @borda/client  | 0.0.1   | `bun/browser` |
| @borda/browser | 0.0.1   | `browser`     |

# Batteries

- REST API
- Query API
- Realtime API
- Client SDK
- Server SDK
- Cache
- Authentication
- Password Reset
- Database Triggers
- Cloud Functions


## FAQ

- Q: Can I run Borda on Node.js?

  A: Short answer is no. Borda is built on top of Elysia which is primarily designed to run in bun. However, they provide a `node` plugin that's intended to allow Elysia to run in Node.js, but this is still experimental and we don't recommend for production usage.

- Q: When should the client package be utilized in the server?

  A: You'd typically use the client package on the server side when you need to connect to a Borda server somewhere else. Plus, the client package comes with a bunch of handy tools and types that can make your life easier when you're working on the server.
