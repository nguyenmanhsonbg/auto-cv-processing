#!/bin/sh
set -e

MAX_ATTEMPTS="${MIGRATION_MAX_ATTEMPTS:-30}"
SLEEP_SECONDS="${MIGRATION_RETRY_DELAY_SECONDS:-5}"

attempt=1
while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do
  echo "Running database migrations (attempt ${attempt}/${MAX_ATTEMPTS})..."
  if npx typeorm migration:run -d dist/config/typeorm.config.js; then
    break
  fi

  if [ "$attempt" -eq "$MAX_ATTEMPTS" ]; then
    echo "Migration failed after ${MAX_ATTEMPTS} attempts"
    exit 1
  fi

  echo "Migration attempt ${attempt} failed. Retrying in ${SLEEP_SECONDS}s..."
  sleep "$SLEEP_SECONDS"
  attempt=$((attempt + 1))
done

echo "Starting application..."
exec node dist/main
