# Instante

# deploying accessory with kamal doesn't run the entrypoint.d scripts
# so we need to exec into the container and run the script manually
docker exec -it insta-db /bin/sh -c "/docker-entrypoint-initdb.d/startup.sh"

kamal app exec 'bun run apps/db/seed.ts' -c apps/api/config/deploy.yml