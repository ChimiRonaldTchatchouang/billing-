# Caisse & facturation supermarché

Caisse multi-magasins utilisable sans connexion, back-office et facturation. Projet Nextiaa.

| Dossier           | Contenu                                                             |
| ----------------- | ------------------------------------------------------------------- |
| `apps/web`        | React + Vite : `/caisse` (PWA hors ligne) et `/admin` (back-office) |
| `apps/api`        | NestJS + Prisma : API `/api/v1`, documentation sur `/api/docs`      |
| `packages/shared` | Calculs (totaux, TVA, remises, rendu monnaie), schémas Zod          |
| `docs`            | Cahier des charges, décisions, déploiement                          |

## Démarrer en local

Prérequis : Node 22, pnpm 10, PostgreSQL 16.

```bash
pnpm install
pnpm --filter @caisse/shared build
cp apps/api/.env.example apps/api/.env      # adapter DATABASE_URL
cp apps/web/.env.example apps/web/.env
cd apps/api && pnpm exec prisma migrate deploy && pnpm build && pnpm start
cd apps/web && pnpm dev
```

- Caisse : http://localhost:5173/caisse
- API : http://localhost:3000/health — documentation : http://localhost:3000/api/docs

## Vérifications

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```
