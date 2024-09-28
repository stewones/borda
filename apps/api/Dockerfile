# Use the official Bun image
FROM oven/bun:alpine
LABEL maintainer="Stewan Silva <stewan@intenseloop.com>"

# Create and change to the app directory.
WORKDIR /usr/src/app

# Copy local code to the container image.
COPY ./ ./
COPY ./apps/api/config/startup.sh /usr/src/app/startup.sh
RUN chmod +x /usr/src/app/startup.sh

# Install 
RUN bun install --production

EXPOSE 80

# Run the seed and then the web service on container startup.
CMD ["/usr/src/app/startup.sh"]
