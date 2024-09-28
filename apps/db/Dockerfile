# Use the official MongoDB community image
FROM mongo:latest
LABEL maintainer="Stewan Silva <stewan@intenseloop.com>"

# Install necessary packages
RUN apt-get update && apt-get install -y sudo vim

# Copy the setup scripts into the container
COPY ./apps/db/setup.sh /docker-entrypoint-initdb.d/

# Ensure the scripts have execute permissions
RUN chmod +x /docker-entrypoint-initdb.d/setup.sh

# Expose the default MongoDB port
EXPOSE 27017

# Set the entrypoint to ensure the script runs
# ENTRYPOINT ["/docker-entrypoint-initdb.d/setup.sh"]

# Start MongoDB
CMD ["mongod"]