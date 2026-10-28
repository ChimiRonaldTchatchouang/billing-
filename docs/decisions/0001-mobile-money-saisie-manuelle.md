# 0001 — Mobile Money en saisie manuelle au MVP

Date : 28 octobre 2026 — Statut : acceptée (à valider par le client avant le pilote)

## Contexte

Le cahier initial prévoit un agrégateur (Notch Pay, CinetPay ou Campay) : demande de paiement, webhook
signé, interrogation du statut toutes les 3 s. C'est le module le plus coûteux du MVP (contrat marchand,
délai d'ouverture du compte, environnement de test, gestion des cas d'échec), et il exige le réseau.

## Décision

Au MVP, le paiement Mobile Money est saisi à la main : opérateur, numéro du client, référence de
transaction reçue par SMS. Le paiement est enregistré au statut `A_RAPPROCHER`. Le gérant rapproche
chaque jour les paiements avec le relevé de l'opérateur (`RAPPROCHE` ou `ECART`).

## Conséquences

- Plus de dépendance à un agrégateur pour démarrer ; Mobile Money fonctionne aussi hors ligne.
- Risque : un caissier peut saisir une référence fictive. Il est réduit par le rapprochement quotidien
  et par le journal d'audit (chaque paiement porte le caissier et la caisse).
- L'intégration par agrégateur est reportée en V2 ; la table `payments` garde les champs nécessaires.
