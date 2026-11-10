#!/bin/sh
# Start command for hosted deploys.
set -e
python -m app.check_production      # stop when a production setting is unsafe
echo "Applying database migrations..."
alembic upgrade head
echo "Migrations applied."
if [ "$ALLOW_DEMO_SEED" = "true" ]; then
  # Synthetic demo data. Skips when the database already has data.
  # Runs beside the server so the host sees an open port straight away.
  (python -m app.seed && echo "Demo data step finished." || echo "Demo data step FAILED.") &
fi
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --no-server-header
