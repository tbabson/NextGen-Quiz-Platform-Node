#!/bin/sh
# Container start: apply migrations, optionally seed (idempotent), then hand PID 1 to Node
# so SIGTERM reaches the graceful-shutdown handler.
set -e

node_modules/.bin/knex --knexfile knexfile.js migrate:latest

if [ "$SEED_ON_START" = "true" ]; then
  node_modules/.bin/knex --knexfile knexfile.js seed:run
fi

exec node src/server.js
