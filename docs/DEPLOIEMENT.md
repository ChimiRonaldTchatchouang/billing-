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
2. Saisir `DATABASE_URL`, `DIRECT_URL` et `CORS_ORIGINS` dans chaque service.
3. Settings → Deploy Hook : copier l'URL dans le secret `RENDER_DEPLOY_HOOK` de l'environnement GitHub.
4. La production passe en offre payante (`starter`) dès le pilote.

## Vercel

1. Importer le dépôt, **Root Directory** : `apps/web` (le reste vient de `apps/web/vercel.json`).
2. Variable `VITE_API_URL` : URL Render de recette pour Preview, de production pour Production.
3. Production Branch : `main`. La branche `develop` sert d'adresse de recette.
4. Passer en Vercel Pro avant le pilote (usage commercial).

## Sauvegarde et restauration

`backup.yml` exporte la base de production chaque nuit, chiffrée, vers le stockage externe.
Restauration :

```bash
rclone copy "$BACKUP_REMOTE/caisse-AAAA-MM-JJ.dump.gpg" .
gpg --decrypt caisse-AAAA-MM-JJ.dump.gpg > caisse.dump
pg_restore --no-owner --clean --if-exists -d "$DIRECT_URL_CIBLE" caisse.dump
```

Exercice de restauration chronométré à faire avant le pilote (cible : moins d'1 heure).
