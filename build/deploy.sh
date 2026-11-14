#!/usr/bin/env bash
# Test, build and deploy the Hagrid workflow straight into the local n8n database.
# n8n must be STOPPED (it only reads imported workflows on start). Start it again afterwards with:
#   WEBHOOK_URL=http://localhost:5678 n8n start
set -euo pipefail
cd "$(dirname "$0")"
WORKFLOW_ID="${1:-vaYgPCNzsZcgqt9Q}"

if curl -s -m 2 -o /dev/null http://localhost:5678/healthz; then
  echo "n8n is running on :5678. Stop it first, then re-run this script." >&2
  exit 1
fi

node test-logic.js
node build.js ../hagrid-negotiation-workflow.json "$WORKFLOW_ID"

mkdir -p "$HOME/.n8n/backups"
backup="$HOME/.n8n/backups/before-deploy-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup" && cp "$HOME"/.n8n/database.sqlite* "$backup/"
echo "Database backed up to $backup"

n8n import:workflow --input=../hagrid-negotiation-workflow.json
n8n publish:workflow --id="$WORKFLOW_ID"
echo "Deployed version $(cat version.txt). Start n8n, then press Ctrl+F5 on the HTML page."
