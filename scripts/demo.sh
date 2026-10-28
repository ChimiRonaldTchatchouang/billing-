#!/usr/bin/env bash
# Démarre l'application en local avec des données de démonstration.
#   ./scripts/demo.sh            (PostgreSQL local sur localhost:5432, utilisateur postgres/postgres)
#   DEMO_DATABASE_URL=... ./scripts/demo.sh
set -euo pipefail
cd "$(dirname "$0")/.."

BASE="${DEMO_DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/caisse_demo}"
ADMIN="${BASE%/*}/postgres"
NOM="${BASE##*/}"

echo "→ Installation et compilation"
pnpm install --frozen-lockfile
pnpm --filter @caisse/shared build
pnpm --filter @caisse/api build

echo "→ Base de démonstration ${NOM} (recréée)"
psql "$ADMIN" -v ON_ERROR_STOP=1 -qc "DROP DATABASE IF EXISTS ${NOM} WITH (FORCE)" -c "CREATE DATABASE ${NOM}"
export DATABASE_URL="$BASE" DIRECT_URL="$BASE"
(cd apps/api && pnpm exec prisma migrate deploy)
(cd apps/api && SEED_ORG_NAME="Supermarché Démo" SEED_ORG_NIU=M012345678901A SEED_ORG_RCCM=RC/DLA/2024/B/0001 \
  SEED_ADMIN_NAME="Directrice Démo" SEED_ADMIN_EMAIL=directeur@demo.cm SEED_ADMIN_PASSWORD=directeur-demo-2026 \
  SEED_DEMO=1 node dist/seed.js)

export PORT=3000 CORS_ORIGINS=http://localhost:5173
export JWT_ACCESS_SECRET="demo-local-$(openssl rand -hex 24)" PDF_LINK_SECRET="demo-local-$(openssl rand -hex 24)"
node apps/api/dist/main.js &
API=$!
trap 'kill $API 2>/dev/null' EXIT

cat <<'TXT'

  Back-office : http://localhost:5173/admin
    directeur@demo.cm / directeur-demo-2026   (tout)
    gerant@demo.cm    / gerant-demo-2026      (magasin M01, PIN 9999)
  Caisse      : http://localhost:5173/caisse
    1. Back-office > Caisses > « Code d'enregistrement » ; saisir le code sur la caisse
    2. Caissière Démo, PIN 1234 ; articles : 6001234000011, 6001234000028, « tomates »…
  API         : http://localhost:3000/api/docs

TXT
cd apps/web && VITE_API_URL=http://localhost:3000 pnpm exec vite --port 5173
