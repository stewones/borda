#!/bin/bash

CONFIG_FILE="/config/db"
LOG_FILE="/config/log.txt"

echo "🛠️ Starting mongo setup..." >> "$LOG_FILE"

# Read user and password from a file
source "$CONFIG_FILE"

# Check if INSTA_USER and INSTA_PASSWORD are set
if [ -z "$INSTA_DB_USER" ] || [ -z "$INSTA_DB_PASSWORD" ]; then
    echo "🚨 INSTA_DB_USER or INSTA_DB_PASSWORD is not set. Exiting." >> "$LOG_FILE"
    exit 1
fi

# Connect to MongoDB and configure
echo "👮 Creating user $INSTA_DB_USER..." >> "$LOG_FILE"
mongosh <<EOF
    use admin
    disableTelemetry()
    rs.initiate()
    use insta
    db.createUser({
        user: "$INSTA_DB_USER",
        pwd: "$INSTA_DB_PASSWORD",
        roles: [
            "readWrite",
            "dbAdmin"
        ]
    })
    rs.status()
EOF

echo "✅ Finished mongo setup!" >> "$LOG_FILE"