# Use the official Bun image
FROM oven/bun:alpine
LABEL maintainer="Stewan Silva <stewan@intenseloop.com>"

# Create and change to the app directory.
WORKDIR /usr/src/app

# Copy local code to the container image.
COPY ./ ./

# Install 
RUN bun install --production

EXPOSE 80

# Run the web service on container startup.
CMD [ "bun", "apps/api/src/main.ts"]
