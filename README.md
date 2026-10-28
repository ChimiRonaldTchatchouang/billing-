# Caisse & facturation supermarché

Caisse multi-magasins utilisable sans connexion, back-office et facturation. Projet Nextiaa.

| Dossier           | Contenu                                                             |
| ----------------- | ------------------------------------------------------------------- |
| `apps/web`        | React + Vite : `/caisse` (PWA hors ligne) et `/admin` (back-office) |
| `apps/api`        | NestJS + Prisma : API `/api/v1`, documentation sur `/api/docs`      |
| `packages/shared` | Calculs (totaux, TVA, remises, rendu monnaie), schémas Zod          |
| `docs`            | Cahier des charges, décisions, déploiement                          |

## Ce que fait l'application

- **Caisse (PWA, `/caisse`)** : enregistrement du poste par code, connexion par PIN (même sans réseau),
  scan à la douchette, articles au poids, remises / prix / retraits validés par PIN gérant, espèces et
  Mobile Money (saisie manuelle), ticket 80 mm, vente hors ligne avec envoi automatique, retours sur
  ticket, clôture avec écart de caisse, factures pour les clients professionnels.
- **Back-office (`/admin`)** : tableau de bord, ventes, rapprochement Mobile Money, sessions de caisse,
  rapports et export Excel, articles et import, stock (réceptions, inventaire), caisses, magasins,
  utilisateurs, entreprise (NIU, RCCM).
- **API (`/api/v1`)** : toute la logique métier, documentation OpenAPI sur `/api/docs`.

## Démonstration en une commande

Prérequis : Node 22, pnpm 10, PostgreSQL 16 local.

```bash
./scripts/demo.sh
```

## Démarrer en local (développement)

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
