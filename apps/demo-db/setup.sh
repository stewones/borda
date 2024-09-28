if [ ! -s /config/db.lock ]; then
    echo "🔧 Configuring MongoDB..."

    # Read user and password from a file
    source /data/config/db

    # Connect to MongoDB and configure
    mongosh <<EOF
    use admin
    disableTelemetry()
    rs.initiate()
    use insta
    db.createUser({
        user: "$INSTA_USER",
        pwd: "$INSTA_PASSWORD",
        roles: [
            "readWrite",
            "dbAdmin"
        ]
    })
    rs.status()
EOF

    # white lock
    touch /config/db.lock
else
    echo "⚠️  MongoDB is already configured. Skipping configuration."
fi