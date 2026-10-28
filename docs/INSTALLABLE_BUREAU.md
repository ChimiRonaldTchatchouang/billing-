# Version de bureau (Windows) — pour tester sans internet

Un seul installateur contient tout : la caisse et le back-office, l'API, et une base PostgreSQL
intégrée. Rien à configurer, aucun compte en ligne. Les données restent sur le PC.

> C'est une version de **démonstration et de test**. En production, la caisse est une application
> web installable reliée au serveur central (voir `DEPLOIEMENT.md`).

## Installer

1. Lancer `Caisse-et-facturation-Installation-1.0.0.exe`.
   L'installateur n'est pas signé : Windows peut afficher « Windows a protégé votre ordinateur ».
   Cliquer sur **Informations complémentaires**, puis **Exécuter quand même**.
2. Suivre l'assistant. Un raccourci « Caisse et facturation » est créé sur le bureau.
3. Au premier lancement, la base est créée et remplie avec des données de démonstration
   (environ 30 secondes). Si le pare-feu Windows pose une question, autoriser l'accès sur les
   réseaux privés.

Sans installation : décompresser `Caisse-et-facturation-1.0.0-x64.zip` et lancer
`Caisse et facturation.exe`.

## Tester

| Où                                            | Identifiants                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------ |
| Back-office (s'ouvre au démarrage)            | `directeur@demo.cm` / `directeur-demo-2026` ou `gerant@demo.cm` / `gerant-demo-2026` |
| Caisse (menu Application > Caisse, ou Ctrl+1) | Caissière Démo : PIN **1234** — Gérant Démo : PIN **9999**                           |

1. Back-office > **Caisses** > « Code d'enregistrement » : noter le code.
2. Menu **Application > Caisse** : saisir le code, choisir « Caissière Démo », PIN 1234, ouvrir la
   caisse avec un fond de caisse.
3. Scanner (ou taper puis Entrée) : `6001234000011` (riz), `6001234000028` (huile),
   `6001234000042` (lait), `6001234000059` (eau), ou taper « tomates » (article au poids).
4. Encaisser (F2), puis revenir au back-office (Ctrl+2) : tableau de bord, ventes, stock…

Le menu **Aide > Comptes de démonstration** rappelle ces informations.

## Données et désinstallation

- Données (base, journal `journal.log`) : `%APPDATA%\Caisse et facturation` — menu
  Application > Dossier des données.
- Pour repartir de zéro : fermer l'application et supprimer ce dossier.
- Désinstaller : Paramètres Windows > Applications.

## Fabriquer l'installateur

- Automatiquement : workflow GitHub Actions « Installable Windows » (onglet Actions, ou push d'un
  tag `bureau-v*`). Il fabrique l'installateur sur Windows, vérifie le démarrage (base, migrations,
  démo, API) et publie l'installateur en artefact.
- Sur un poste Windows : `pnpm install` puis `pnpm --filter @caisse/desktop paquet`.
- Sous Linux : même commande, avec Wine (64 et 32 bits) installé pour l'installateur NSIS.
