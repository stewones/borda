FROM oven/bun:alpine
# FROM node:18-alpine
LABEL maintainer="Stewan Silva <stewan@intenseloop.com>"

# Create and change to the app directory.
WORKDIR /usr/src/app

# Copy local code to the container image.
COPY ./ ./

EXPOSE 80

# Run the web service on container startup.
CMD ["bun", "server.ts"]