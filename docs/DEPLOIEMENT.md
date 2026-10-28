# Déploiement

## Branches

`feature/US-xx-…` → pull request vers `develop` (recette) → `develop` fusionnée dans `main` →
tag `vX.Y.Z` sur `main` (production).

## Neon

Un projet Neon, trois branches :

| Branche Neon        | Usage                                                    |
| ------------------- | -------------------------------------------------------- |
| `main` (principale) | Production                                               |
| `staging`           | Recette                                                  |
| `dev`               | Développement (facultatif ; PostgreSQL local recommandé) |

Pour chaque branche, deux chaînes de connexion :

- `DATABASE_URL` : connexion **poolée** (hôte en `-pooler`), avec `?sslmode=require&pgbouncer=true`.
- `DIRECT_URL` : connexion **directe** (sans `-pooler`), avec `?sslmode=require`, utilisée par les migrations.

## GitHub

Deux environnements GitHub (Settings → Environments) : `recette` et `production`.

| Nom                  | Type     | Recette                                   | Production                                  |
| -------------------- | -------- | ----------------------------------------- | ------------------------------------------- |
| `DATABASE_URL`       | secret   | branche Neon `staging` (poolée)           | branche principale (poolée)                 |
| `DIRECT_URL`         | secret   | branche Neon `staging` (directe)          | branche principale (directe)                |
| `RENDER_DEPLOY_HOOK` | secret   | hook du service `caisse-api-recette`      | hook du service `caisse-api-production`     |
| `API_URL`            | variable | `https://caisse-api-recette.onrender.com` | URL de l'API de production                  |
| `BACKUP_PASSPHRASE`  | secret   | —                                         | phrase de chiffrement des sauvegardes       |
| `RCLONE_CONFIG`      | secret   | —                                         | contenu de `rclone.conf` (stockage externe) |
| `BACKUP_REMOTE`      | variable | —                                         | ex. `gdrive:sauvegardes-caisse`             |

## Render

1. New → Blueprint → choisir ce dépôt : `render.yaml` crée les deux services.
2. Saisir dans chaque service : `DATABASE_URL`, `DIRECT_URL`, `CORS_ORIGINS` (adresse Vercel),
   `PUBLIC_API_URL` (adresse Render du service), `PUBLIC_WEB_URL` (adresse Vercel), `RESEND_API_KEY`,
   `MAIL_FROM`. `JWT_ACCESS_SECRET` et `PDF_LINK_SECRET` sont générés par Render.
3. Settings → Deploy Hook : copier l'URL dans le secret `RENDER_DEPLOY_HOOK` de l'environnement GitHub.
4. La production passe en offre payante (`starter`) dès le pilote.

## Premier démarrage d'une base

Après les migrations, créer l'organisation et le premier directeur (une seule fois), depuis le Shell
Render du service :

```bash
SEED_ORG_NAME="Nom du supermarché" SEED_ORG_NIU=... SEED_ORG_RCCM=... \
SEED_ADMIN_NAME="Nom du directeur" SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... \
pnpm --filter @caisse/api db:seed
```

Ajouter `SEED_DEMO=1` en recette pour un magasin, une caisse, un gérant (PIN 9999), une caissière
(PIN 1234) et quelques articles.

## Vercel

1. Importer le dépôt, **Root Directory** : `apps/web` (le reste vient de `apps/web/vercel.json`).
2. Variable `VITE_API_URL` : URL Render de recette pour Preview, de production pour Production.
3. Production Branch : `main`. La branche `develop` sert d'adresse de recette.
4. Passer en Vercel Pro avant le pilote (usage commercial).

## Resend

1. Créer un compte Resend, ajouter le domaine d'envoi (ex. `caisse.<domaine>`) et publier chez
   l'hébergeur DNS les enregistrements SPF et DKIM indiqués par Resend.
2. Créer une clé d'API « envoi seulement » et la saisir dans `RESEND_API_KEY` sur Render.
3. `MAIL_FROM` : par exemple `Supermarché X <factures@caisse.<domaine>>`.

## Sauvegarde et restauration

`backup.yml` exporte la base de production chaque nuit, chiffrée, vers le stockage externe.
Restauration :

```bash
rclone copy "$BACKUP_REMOTE/caisse-AAAA-MM-JJ.dump.gpg" .
gpg --decrypt caisse-AAAA-MM-JJ.dump.gpg > caisse.dump
pg_restore --no-owner --clean --if-exists -d "$DIRECT_URL_CIBLE" caisse.dump
```

Exercice de restauration chronométré à faire avant le pilote (cible : moins d'1 heure).
