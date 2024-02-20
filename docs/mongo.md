# new mongo deployments

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


# start mongod process

```sh
mongod --config /opt/homebrew/etc/mongod.conf --fork
```

https://www.mongodb.com/docs/manual/tutorial/install-mongodb-on-os-x/
