# new mongo deployments
- see intense/chatness database docker compose
- once running connect to the vm/container/mongosh
- use admin
- rs.initiate()
- add user
```
    db.createUser({
    user: "username",
    pwd: "secure*password",
        roles: [
            "readWrite",
            "dbAdmin"
        ]
    })
```


# start mac m1 process

```sh
mongod --config /opt/homebrew/etc/mongod.conf --fork
```

https://www.mongodb.com/docs/manual/tutorial/install-mongodb-on-os-x/
