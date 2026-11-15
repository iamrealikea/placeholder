#!/bin/bash
set -euo pipefail

PERSISTENT_ROOT="/var/tickethub"
DATA_DIR="${PERSISTENT_ROOT}/data"
BACKUP_DIR="${DATA_DIR}/backups"
UPLOAD_DIR="${PERSISTENT_ROOT}/uploads"
STAGING_DATA="/var/app/staging/data"

mkdir -p "${DATA_DIR}" "${BACKUP_DIR}" "${UPLOAD_DIR}"

# Seed initial JSON collections on first deployment only (preserves live data on redeploy)
if [ ! -f "${DATA_DIR}/users.json" ] && [ -d "${STAGING_DATA}" ]; then
  echo "[TicketHub] Initializing persistent data store at ${DATA_DIR} from bundle seed data..."
  cp -n "${STAGING_DATA}"/*.json "${DATA_DIR}/" || true
fi

# Ensure the Elastic Beanstalk Node.js runtime user (webapp) owns persistent directories
chown -R webapp:webapp "${PERSISTENT_ROOT}"
chmod -R 755 "${PERSISTENT_ROOT}"
