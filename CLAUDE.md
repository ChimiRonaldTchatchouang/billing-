# CLAUDE.md — Caisse & facturation supermarché (Nextiaa)

Application de caisse multi-magasins hors ligne (PWA), API NestJS, PostgreSQL Neon.

**Document de référence : `docs/CAHIER_DES_CHARGES.md`. Le lire avant toute action.**
Décisions : `docs/decisions/NNNN-titre.md`. Déploiement : `docs/DEPLOIEMENT.md`.

## Méthode de travail

1. Réaliser les sprints de la section 15 du cahier des charges **dans l'ordre**.
2. Une branche par user story (`feature/US-xx-description`), pull request vers `develop`.
3. En fin de sprint, présenter : travail réalisé, écarts, résultats des tests, ressources et clés
   nécessaires pour le sprint suivant.
4. Demander les clés au moment où elles sont nécessaires. Ne jamais les écrire dans le code, les
   commits ou les journaux.
5. Ambiguïté fiscale ou comptable : ne pas deviner. Marquer `A_CONFIRMER`, continuer, signaler.
6. Toute décision qui s'écarte du cahier des charges est consignée dans `docs/decisions/`.

## Règles absolues

- Montants en **entiers FCFA**, taux de TVA en **points de base** (1925 = 19,25 %). Jamais de flottant.
- Les calculs de prix, TVA, remises et rendu monnaie vivent dans `packages/shared`, utilisés par la
  caisse et l'API. Jamais dupliqués.
- Le stock ne change que par un `stock_movements`, et `stock_levels` est mis à jour dans la même
  transaction.
- `POST /sync/sales` est idempotent : l'identifiant UUID v7 de la caisse fait foi.
- Une vente, une facture ou une ligne de `audit_logs` n'est jamais modifiée ni supprimée
  (triggers en base). Une correction passe par un avoir ou un retour.
- Remise, annulation, retour, modification de prix : PIN gérant + `audit_logs`.
- Le filtrage par magasin est fait côté serveur selon le rôle, jamais d'après un paramètre du navigateur.
- Toutes les tables portent `organization_id`.
- Pas d'`eval`. Pas de secret dans le dépôt.
- Interface et messages d'erreur en français simple. Erreurs API : `{ code, message, details? }`.

## Commandes

- Installation : `pnpm install` puis `pnpm --filter @caisse/shared build`
- Tout le dépôt : `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`
- API : `cd apps/api && pnpm test`
  - Tests base de données : `TEST_DATABASE_URL_ADMIN=postgresql://postgres:postgres@localhost/postgres pnpm test`
    (PostgreSQL 16 local ; la base `caisse_tests` est recréée à chaque passage, jamais sur Neon)
  - Nouvelle migration : `pnpm exec prisma migrate dev --name description`
- Web : `cd apps/web && pnpm dev` (http://localhost:5173), `pnpm test`, `pnpm build`

## Définition de « terminé »

- Tests écrits et passants, lint et typage sans erreur.
- Actions sensibles inscrites au journal d'audit.
- Messages d'erreur en français, au format standard de l'API.
- OpenAPI à jour (décorateurs Swagger) si un endpoint a changé.
