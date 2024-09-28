# Use the official MongoDB community image
FROM mongo:latest
LABEL maintainer="Stewan Silva <stewan@intenseloop.com>"

# Install necessary packages
RUN apt-get update && apt-get install -y sudo vim

# Copy the setup scripts into the container
COPY ./apps/demo-db/setup.sh /docker-entrypoint-initdb.d/

# Ensure the scripts have execute permissions
RUN chmod +x /docker-entrypoint-initdb.d/setup.sh

# Expose the default MongoDB port
EXPOSE 27017

# Start MongoDB
CMD ["mongod"]