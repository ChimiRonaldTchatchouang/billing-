# 0003 — Périmètre MVP allégé et versions des outils

Date : 28 octobre 2026 — Statut : acceptée

## Décision

1. Périmètre réduit par rapport au cahier initial (détail en section 12 du cahier des charges) :
   17 tables au lieu de 22, 3 rôles au lieu de 4, un seul prix par article, pas de transferts entre
   magasins, deux modèles d'e-mail, trois workflows GitHub Actions.
2. La CI utilise un PostgreSQL 16 en conteneur plutôt qu'une branche Neon par pull request : plus
   rapide, aucune clé Neon nécessaire en CI, aucun nettoyage.
3. Versions majeures retenues, stables et éprouvées : Node 22, TypeScript 5.9, NestJS 11, Prisma 6,
   Vite 7, Vitest 3, React 19, Tailwind 4, Zod 4. Les montées de version majeure se font par une
   pull request dédiée.
