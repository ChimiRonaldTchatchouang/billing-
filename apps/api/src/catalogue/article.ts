import type { Category, Product } from '@prisma/client';

export const articlePublic = (p: Product & { category?: Category | null }) => ({
  id: p.id,
  codeBarres: p.barcode,
  nom: p.name,
  unite: p.unit,
  tauxTvaBp: p.vatRateBp,
  prixTtc: p.priceTtc,
  dernierPrixAchat: p.lastPurchasePrice,
  seuilAlerte: p.alertThreshold,
  categorieId: p.categoryId,
  categorie: p.category?.name ?? null,
  actif: p.active,
  majLe: p.updatedAt.toISOString(),
});
