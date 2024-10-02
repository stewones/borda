# Instante

# deploying accessory with kamal doesn't run the entrypoint.d scripts
# so we need to exec into the container and run the script manually
ssh -t -i ~/.ssh/insta.pem super@172.206.58.38 'docker exec -it insta-mongo-db /bin/sh -c "/docker-entrypoint-initdb.d/startup.sh"'

# seed the database
ssh -t -i ~/.ssh/insta.pem super@172.206.58.38 'docker exec -it insta-app-id /bin/sh -c "bun run apps/db/seed.ts"'
# kamal way
kamal app exec 'bun run apps/db/seed.ts' -c apps/api/deploy.yml


# connect to insta server
ssh -i ~/.ssh/insta.pem super@

# see free dist and memory on host
df -h
free -m

# show all containers and memory usage (run on host)
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}" | awk 'BEGIN {print "NAME\tMEMORY USAGE"} NR>1 {print $0; split($2,a,"/"); sum+=a[1]} END {print "---------------------"; printf "Total\t%.2f MB\n", sum}'

# show app containers
kamal app containers -c apps/app/deploy.yml

# rollback app to previous version
kamal app rollback container_hash -c apps/app/deploy.yml
