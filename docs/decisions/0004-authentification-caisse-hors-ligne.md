# 0004 — Authentification des caisses et PIN vérifié hors ligne

Date : 28 octobre 2026 — Statut : acceptée

## Contexte

La caisse doit vendre 8 heures sans réseau. Un jeton d'utilisateur de 15 minutes ne peut pas couvrir
cette durée, et un caissier doit pouvoir se connecter, et un gérant valider une remise, sans réseau.

## Décision

1. **Jeton d'appareil.** Un poste enregistré reçoit un jeton `registerId.secret` (le serveur ne garde
   que l'empreinte SHA-256 du secret). Il authentifie la caisse auprès de l'API (`Authorization: Caisse …`)
   pour la synchronisation, indépendamment de la personne connectée. Désactiver ou réenregistrer une
   caisse révoque l'ancien jeton.
2. **Enregistrement par code.** Un gérant génère dans le back-office un code de 8 caractères, valable
   15 minutes et à usage unique, saisi sur le poste (`POST /registers/activate`).
3. **PIN vérifié localement.** Le PIN est haché en PBKDF2-SHA256 (100 000 itérations, sel aléatoire)
   par la même fonction dans le navigateur et dans l'API (`packages/shared`). La caisse télécharge les
   empreintes du personnel de son magasin (`GET /sync/staff`) et vérifie le PIN localement, avec la même
   règle de blocage (3 erreurs, 5 minutes). Les actions validées hors ligne par un gérant portent son
   identifiant et sont inscrites au journal d'audit lors de la synchronisation.
4. Les actions qui exigent le réseau (clôture de caisse, retour) revérifient le PIN côté API.

## Conséquences

- Un PIN à 4 chiffres reste devinable à partir de son empreinte par quelqu'un qui extrait les données
  du navigateur d'un poste enregistré. Le risque est accepté pour le MVP : le poste est dans le magasin,
  les actions sont tracées, et un poste perdu se révoque en un clic.
- Les mots de passe du back-office restent hachés en argon2 et ne quittent jamais le serveur.
