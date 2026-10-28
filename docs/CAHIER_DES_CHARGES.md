# Caisse & facturation supermarché — Cahier des charges technique (MVP allégé)

Version : 1.0 — 28 octobre 2026 — Nextiaa

Ce document est la référence du projet. Il reprend le cahier des charges initial en réduisant
le périmètre au strict nécessaire pour encaisser dès le pilote. Les éléments reportés sont listés
en section 12 (V2). Les choix qui s'écartent du cahier initial sont consignés dans `docs/decisions/`.

## 1. Objet et périmètre

Application de caisse et de facturation multi-magasins :

- une application web installable (PWA) qui sert la caisse (`/caisse`, fonctionne hors ligne) et le back-office (`/admin`) ;
- une API TypeScript (NestJS) qui porte toute la logique métier ;
- une base PostgreSQL (Neon) ;
- l'envoi d'e-mails par Resend ;
- un déploiement automatique depuis GitHub.

Hors périmètre du MVP : application mobile native, comptabilité générale, fidélité, paiement par carte
intégré, paiement Mobile Money automatisé (voir décision 0001).

| Couche               | Outil                        | Hébergement |
| -------------------- | ---------------------------- | ----------- |
| Caisse + back-office | React, Vite, PWA hors ligne  | Vercel      |
| API métier           | NestJS (Node.js, TypeScript) | Render      |
| Base de données      | PostgreSQL                   | Neon        |
| E-mails              | Resend (API HTTP)            | Resend      |
| Code et CI/CD        | GitHub + GitHub Actions      | GitHub      |

## 2. Architecture

Une seule application web sert la caisse et le back-office ; une seule API centrale porte la logique
métier ; chaque caisse garde une copie locale pour vendre sans réseau.

Les caisses ne parlent jamais directement à la base : tout passe par l'API, qui contrôle les droits et
garantit qu'une vente synchronisée deux fois n'est enregistrée qu'une fois.

## 3. Choix technologiques

| Besoin         | Choix                                                             |
| -------------- | ----------------------------------------------------------------- |
| Langage        | TypeScript partout                                                |
| Dépôt          | Monorepo pnpm : `apps/web`, `apps/api`, `packages/shared`         |
| API            | NestJS 11                                                         |
| Accès base     | Prisma 6 + migrations versionnées                                 |
| Validation     | Zod (dans `packages/shared`, partagé caisse/API)                  |
| Interface      | React 19 + Vite, Tailwind CSS 4                                   |
| Hors ligne     | vite-plugin-pwa (Workbox) + Dexie (IndexedDB)                     |
| Données client | TanStack Query                                                    |
| Factures PDF   | pdfmake côté API                                                  |
| E-mails        | Resend (API HTTP), gabarits HTML (décision 0005)                  |
| Tests          | Vitest (unitaires), Supertest (API), Playwright (parcours caisse) |
| Erreurs        | Sentry (offre gratuite)                                           |

## 4. Offres gratuites et production

Le gratuit suffit pour développer, tester et faire les démos jusqu'au sprint 5. Dès le pilote
(encaissement réel), deux services passent en payant : **Render** (API de production, pas de mise en
veille) et **Vercel Pro** (usage commercial). Neon reste gratuit jusqu'à 800 MB, avec sauvegarde
quotidienne externe obligatoire (la restauration Neon gratuite ne couvre que 6 h). Resend reste
gratuit (3 000 e-mails/mois, 100/jour). Ces coûts sont refacturés au client.

## 5. Mode hors ligne et synchronisation

Une vente n'est jamais bloquée par le réseau.

1. **Enregistrement du poste.** Un gérant enregistre chaque poste une fois ; il reçoit un identifiant
   d'appareil lié à un magasin et une caisse.
2. **Copie locale.** À l'ouverture puis toutes les 5 minutes, la caisse télécharge les articles modifiés
   depuis sa dernière mise à jour (`updatedSince`) et les range dans IndexedDB.
3. **Vente locale.** Chaque vente reçoit un UUID v7 créé par la caisse et un numéro de ticket propre à la
   caisse : `M01-C02-000123`. Deux caisses ne produisent jamais le même numéro.
4. **File d'attente.** La vente part dans une file locale ; envoi par lot toutes les 15 secondes et à
   chaque retour du réseau.
5. **Réception idempotente.** L'API n'enregistre une vente que si son identifiant est nouveau ; un renvoi
   est ignoré et confirmé comme « déjà reçu ».
6. **Nettoyage.** Les ventes confirmées restent 7 jours sur la caisse (réimpression), puis sont purgées.

Règles :

- Le stock du serveur fait foi. Une vente hors ligne peut rendre un stock négatif : elle est acceptée et
  l'article est signalé au gérant.
- Le prix enregistré est celui affiché en caisse ; un écart avec le prix serveur est signalé, jamais
  corrigé en silence.
- La clôture de caisse exige que toutes les ventes soient synchronisées ; sinon elle affiche le nombre
  de ventes en attente.
- Voyant permanent : vert (en ligne), orange (ventes en attente), rouge (hors ligne depuis plus de 30 min).

## 6. Paiements

- **Espèces** : saisie du montant reçu, calcul du rendu monnaie.
- **Mobile Money (Orange Money, MTN MoMo) — saisie manuelle** (décision 0001) : le client paie sur son
  téléphone vers le compte marchand du magasin ; le caissier saisit l'opérateur, le numéro du client et
  la référence de transaction reçue par SMS. Le paiement est enregistré au statut `A_RAPPROCHER`. Le
  gérant rapproche chaque jour les paiements avec le relevé de l'opérateur depuis le back-office
  (statut `RAPPROCHE` ou `ECART`). Possible hors ligne, puisque l'API n'est pas appelée.
- Plusieurs moyens de paiement peuvent être combinés sur une vente.

## 7. Modèle de données (17 tables, contre 22 au cahier initial)

Chaque table porte `organization_id`. Montants en **entiers FCFA**. Taux de TVA en **points de base**
(1925 = 19,25 %). Le stock n'est jamais modifié directement : chaque changement crée un mouvement, et
`stock_levels` est mis à jour dans la même transaction.

| Domaine      | Table             | Champs clés                                                                                                                                                                |
| ------------ | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Organisation | `organizations`   | id, nom, NIU, RCCM, adresse, téléphone, logo                                                                                                                               |
| Organisation | `stores`          | id, code (M01), nom, adresse, téléphone                                                                                                                                    |
| Organisation | `registers`       | id, store_id, code (C02), device_id, enrôlée le, dernière synchronisation, dernier numéro de ticket                                                                        |
| Accès        | `users`           | id, nom, e-mail, mot de passe (argon2), PIN (haché), rôle, store_id, actif, échecs PIN, bloqué jusqu'à                                                                     |
| Accès        | `refresh_tokens`  | id, user_id, hash, expiration, révoqué                                                                                                                                     |
| Catalogue    | `categories`      | id, nom (un seul niveau)                                                                                                                                                   |
| Catalogue    | `products`        | id, code-barres (unique par organisation), nom, unité, taux de TVA, prix TTC, dernier prix d'achat, seuil d'alerte, actif, updated_at                                      |
| Stock        | `stock_levels`    | product_id, store_id, quantité                                                                                                                                             |
| Stock        | `stock_movements` | id, product_id, store_id, type (vente, réception, ajustement, retour), quantité signée, référence, user_id, date                                                           |
| Stock        | `receipts`        | id, store_id, fournisseur (texte libre), date, user_id                                                                                                                     |
| Stock        | `receipt_lines`   | receipt_id, product_id, quantité, prix d'achat                                                                                                                             |
| Ventes       | `sales`           | id (UUID v7 de la caisse), numéro de ticket, register_id, user_id, session_id, totaux HT/TVA/TTC, remise, statut, vente d'origine (retour), created_at (caisse), synced_at |
| Ventes       | `sale_lines`      | sale_id, product_id, libellé et prix figés, quantité, remise, taux de TVA, montants                                                                                        |
| Ventes       | `payments`        | sale_id, mode (espèces, Orange Money, MTN MoMo), montant, numéro client, référence externe, statut de rapprochement                                                        |
| Ventes       | `invoices`        | id, numéro, sale_id, client (raison sociale, NIU, adresse), envoyée le                                                                                                     |
| Caisse       | `cash_sessions`   | id, register_id, ouverte par, fond de caisse, fermée par, compté par mode, écart, statut                                                                                   |
| Contrôle     | `audit_logs`      | user_id, action, entité, avant/après, register_id, date (jamais modifié)                                                                                                   |

Retirées par rapport au cahier initial : `store_prices`, `suppliers`, `transfers`, `transfer_lines`,
`momo_transactions` (fusionnée dans `payments`).

## 8. API REST

Versionnée sous `/api/v1`, documentée en OpenAPI (Swagger sur `/api/docs`), protégée par jeton sauf la
connexion et `/health`. Erreurs au format standard :
`{ "code": "CODE_MACHINE", "message": "Message en français", "details": [...] }`.

| Module          | Endpoints                                                                                            | Rôles                                  |
| --------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Auth            | `POST /auth/login`, `POST /auth/pin`, `POST /auth/refresh`, `POST /auth/logout`                      | Tous                                   |
| Organisation    | `GET/POST/PATCH /stores`, `/registers`, `POST /registers/:id/enroll`                                 | Directeur                              |
| Utilisateurs    | `GET/POST/PATCH /users`                                                                              | Directeur                              |
| Catalogue       | `GET /products?updatedSince=`, `POST/PATCH /products`, `POST /products/import`                       | Lecture : tous ; écriture : gérant+    |
| Synchronisation | `POST /sync/sales` (lot idempotent), `GET /sync/catalog?since=`                                      | Caisse enregistrée                     |
| Ventes          | `GET /sales`, `GET /sales/:id`, `POST /sales/:id/return`                                             | Gérant+                                |
| Factures        | `POST /sales/:id/invoice`, `GET /invoices/:id/pdf`, `POST /invoices/:id/send`                        | Caissier+                              |
| Paiements       | `GET /payments?status=A_RAPPROCHER`, `PATCH /payments/:id/reconcile`                                 | Gérant+                                |
| Stock           | `GET /stock?storeId=`, `POST /receipts`, `POST /stock/adjustments`                                   | Gérant+                                |
| Caisse          | `POST /cash-sessions/open`, `POST /cash-sessions/:id/close`, `GET /cash-sessions/:id/report`         | Caissier (ouverture), gérant (clôture) |
| Rapports        | `GET /reports/dashboard`, `GET /reports/sales?from=&to=&storeId=`, `GET /reports/sales/export` (CSV) | Gérant (son magasin), directeur (tous) |
| Santé           | `GET /health`                                                                                        | Public                                 |

Le filtrage par magasin est appliqué côté serveur selon le rôle, jamais déduit d'un paramètre du navigateur.

## 9. Intégrations

- **E-mails (Resend, API HTTP)** : deux modèles (gabarits HTML, décision 0005) — facture avec PDF
  joint, réinitialisation du mot de passe. Envoi direct, statut enregistré, bouton « Renvoyer » en cas d'échec. Les alertes de
  rupture et le résumé de clôture sont affichés dans le back-office (pas d'e-mail au MVP).
- **Factures PDF** : générées à la demande depuis la base, sans stockage de fichier.
- **WhatsApp** : lien `wa.me` prérempli contenant un lien signé vers le PDF, valable 7 jours.
- **Matériel** : douchette USB en mode clavier (suffixe « Entrée ») ; imprimante thermique 80 mm via
  Chrome en mode kiosque (`--kiosk-printing`), CSS `@page` 80 mm ; tiroir-caisse ouvert par le pilote de
  l'imprimante (QZ Tray en secours). Poste : PC Windows ou mini-PC, Chrome, 4 GB, onduleur.

## 10. Sécurité et conformité

| Sujet             | Exigence                                                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| Back-office       | E-mail + mot de passe argon2 ; jeton d'accès 15 min, renouvellement 7 jours, révocable                     |
| Caisse            | PIN 4 chiffres valable seulement sur un poste enregistré ; 3 erreurs bloquent 5 minutes                    |
| Rôles             | 3 rôles contrôlés côté API : directeur (tous les magasins, administration), gérant (son magasin), caissier |
| Actions sensibles | Remise, annulation, retour, modification de prix : PIN d'un gérant + `audit_logs`                          |
| Retours           | Uniquement sur présentation du ticket d'origine (décision 0002)                                            |
| Transport         | HTTPS, CORS limité aux domaines de l'application, Helmet                                                   |
| Abus              | Limitation du nombre de requêtes sur la connexion et le PIN                                                |
| Secrets           | Variables d'environnement Render, Vercel, GitHub ; jamais dans le code                                     |
| Sauvegardes       | Sauvegarde quotidienne externe chiffrée, restauration testée avant le pilote                               |

**Factures et tickets.** Numérotation continue sans trou par série ; une série par caisse pour rester
juste hors ligne. Une facture émise n'est jamais modifiée ni supprimée ; une correction passe par un
avoir. Mentions : raison sociale, NIU et RCCM du supermarché, NIU du client professionnel, détail HT,
TVA et TTC par taux. **A_CONFIRMER avec le comptable du client** : la liste exacte des mentions,
l'acceptation d'une série par caisse, et la règle d'arrondi de la TVA (voir section 11).

## 11. Règles de calcul (`packages/shared`)

- Les prix catalogue sont TTC, en FCFA entiers.
- Ligne : `brut = prix TTC × quantité` ; `net = brut − remise de ligne`.
- Quantités en entiers (unités) ou en millièmes pour les articles au poids (`unité = KG`, 1 kg = 1000).
- Remise de ticket répartie au prorata des lignes (le reste d'arrondi sur la plus grosse ligne).
- TVA calculée **par taux**, sur le total TTC net de chaque taux :
  `TVA = arrondi(TTC × taux / (10 000 + taux))`, `HT = TTC − TVA`.
  Arrondi au FCFA le plus proche, demi vers le haut. **A_CONFIRMER** (comptable).
- Rendu monnaie : `reçu − total` ; refusé si le paiement total est inférieur au TTC.
- Aucun flottant pour un montant : calculs en entiers uniquement.

## 12. Reporté en V2

Paiement Mobile Money via agrégateur (webhook, interrogation du statut), prix par magasin, transferts
entre magasins, fiche fournisseurs, arborescence de catégories, alertes et résumés par e-mail, file de
tâches pg-boss, graphiques avancés, rôle admin séparé du directeur.

## 13. CI/CD et environnements

Branches : `feature/US-xx-...` → pull request vers `develop` (recette) → `develop` fusionnée dans
`main` ; la production se déploie sur un tag `v*`.

| Workflow     | Déclencheur                                         | Étapes                                                                                                                             |
| ------------ | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`     | Pull request et push sur `develop`/`main`           | pnpm avec cache ; lint ; types ; tests unitaires ; PostgreSQL 16 en conteneur ; migrations Prisma ; tests d'API ; build web et API |
| `deploy.yml` | Push sur `develop` (recette), tag `v*` (production) | Migrations Neon ; deploy hook Render ; vérification de `/health`. Vercel déploie le web automatiquement.                           |
| `backup.yml` | Chaque nuit à 2 h (heure de Douala)                 | `pg_dump` production, compression, chiffrement, envoi vers un stockage externe (rclone), conservation 30 jours                     |

Le parcours Playwright (connexion PIN, scan, encaissement espèces, ticket, clôture) est ajouté à `ci.yml`
dès que la caisse existe.

| Environnement | Web               | API               | Base                    |
| ------------- | ----------------- | ----------------- | ----------------------- |
| Local         | localhost:5173    | localhost:3000    | PostgreSQL local        |
| Recette       | recette.<domaine> | Render staging    | Neon branche `staging`  |
| Production    | caisse.<domaine>  | Render production | Neon branche principale |

Variables :

- API : `DATABASE_URL`, `DIRECT_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `RESEND_API_KEY`,
  `MAIL_FROM`, `PDF_LINK_SECRET`, `CORS_ORIGINS`, `SENTRY_DSN`.
- Web : `VITE_API_URL`, `VITE_SENTRY_DSN`.
- GitHub : `DATABASE_URL_STAGING`, `DATABASE_URL_PROD`, `RENDER_DEPLOY_HOOK_STAGING`,
  `RENDER_DEPLOY_HOOK_PROD`, `API_URL_STAGING`, `API_URL_PROD`, `BACKUP_PASSPHRASE`, `RCLONE_CONFIG`.

## 14. Exigences non fonctionnelles

| Exigence                        | Cible                                                             |
| ------------------------------- | ----------------------------------------------------------------- |
| Ajout d'un article au scan      | < 1 s, en ligne comme hors ligne                                  |
| Encaissement espèces 5 articles | < 30 s                                                            |
| Hors ligne                      | 8 h sans réseau, zéro vente perdue                                |
| Synchronisation                 | Ventes visibles au tableau de bord < 5 min après retour du réseau |
| Catalogue                       | 10 000 articles sans ralentissement                               |
| Poste                           | Chrome récent, 4 GB                                               |
| API indisponible                | Les caisses continuent de vendre                                  |
| Restauration                    | < 1 h                                                             |

Tests obligatoires : unitaires sur `packages/shared` (totaux, TVA, remises, rendu monnaie) et sur les
mouvements de stock ; API sur la synchronisation (renvoi du même lot, lot partiel, vente déjà reçue) et
sur les droits par magasin ; un parcours de bout en bout par sprint.

## 15. Lots (sprints)

| Sprint | Contenu                                                                                     |
| ------ | ------------------------------------------------------------------------------------------- |
| 0      | Monorepo, CI, schéma de base, calculs partagés, `/health`, squelette web PWA, documentation |
| 1      | Auth (mot de passe, PIN, jetons), magasins, caisses, enrôlement, utilisateurs, audit        |
| 2      | Catalogue, import Excel/CSV, synchronisation du catalogue, copie locale                     |
| 3      | Écran de caisse : scan, panier, remises, paiement espèces, ticket 80 mm                     |
| 4      | Hors ligne : file d'attente, `POST /sync/sales` idempotent, voyant, Mobile Money manuel     |
| 5      | Stock : réceptions, ajustements, mouvements, retours, sessions de caisse et clôture         |
| 6      | Factures PDF, envoi Resend, WhatsApp, rapprochement Mobile Money — début du pilote          |
| 7      | Tableau de bord, rapports, export CSV, durcissement, sauvegarde et restauration testées     |
