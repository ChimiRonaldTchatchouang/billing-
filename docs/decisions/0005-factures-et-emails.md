# 0005 — Numérotation des factures, avoirs et e-mails

Date : 28 octobre 2026 — Statut : acceptée (numérotation à confirmer avec le comptable)

## Décision

1. **Deux séries continues, sans trou, par organisation** : `FA-000001` pour les factures, `AV-000001`
   pour les avoirs. Le compteur est incrémenté dans la même transaction que la création de la
   facture : un échec n'en consomme pas, deux factures simultanées ne partagent jamais un numéro.
   Les factures sont émises en ligne (back-office ou caisse connectée) : une série par caisse,
   nécessaire pour les tickets hors ligne, ne l'est pas ici. **A_CONFIRMER** avec le comptable.
2. **Un avoir corrige une facture** : il est émis sur le ticket de retour, reprend le client de la
   facture d'origine et la référence. Une facture émise n'est jamais modifiée (trigger en base).
3. **E-mails** : gabarits HTML simples écrits dans l'API au lieu de React Email (deux modèles
   seulement au MVP : facture avec PDF joint, réinitialisation du mot de passe). Envoi direct par
   l'API HTTP de Resend, sans file de tâches ; en cas d'échec l'utilisateur voit un message et
   réessaie avec le bouton « Envoyer ». Sans `RESEND_API_KEY`, les e-mails sont seulement journalisés
   (développement) ; en production l'envoi est refusé avec un message clair.
4. **PDF** : généré à la demande par pdfmake, jamais stocké. Le lien public est signé (HMAC,
   `PDF_LINK_SECRET`) et expire après 7 jours ; il sert au lien WhatsApp `wa.me` prérempli.

## Écarts au cahier des charges initial

- Sentry n'est pas encore branché : la variable `SENTRY_DSN` est prévue, l'intégration reste à faire
  avant le pilote si le client la souhaite.
