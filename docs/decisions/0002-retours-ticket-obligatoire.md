# 0002 — Retour uniquement sur ticket d'origine

Date : 28 octobre 2026 — Statut : acceptée

## Contexte

Le cahier initial ne précise pas si un retour peut se faire sans ticket.

## Décision

Un retour (`POST /sales/:id/return`) se fait uniquement à partir de la vente d'origine, retrouvée par
son numéro de ticket. La quantité retournée ne peut pas dépasser la quantité vendue, déduction faite des
retours déjà enregistrés. Le PIN d'un gérant est exigé et l'action est inscrite au journal d'audit.

## Conséquences

Pas de retour « libre » : limite la fraude interne. Un geste commercial sans ticket passe par une remise
autorisée par le gérant.
