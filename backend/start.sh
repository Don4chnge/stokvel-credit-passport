#!/bin/sh
# Start command for hosted deploys. Each step must pass before the next one runs.
set -e
python -m app.check_production      # stop when a production setting is unsafe
alembic upgrade head                # apply database migrations
if [ "$ALLOW_DEMO_SEED" = "true" ]; then
  python -m app.seed                # synthetic demo data. Skips when the database already has data
fi
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --no-server-header
