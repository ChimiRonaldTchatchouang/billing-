import type { Prisma, StockMovementType } from '@prisma/client';

export interface Mouvement {
  organizationId: string;
  productId: string;
  storeId: string;
  type: StockMovementType;
  /** Quantité signée : négative pour une sortie (pièces, ou grammes pour un article au poids). */
  quantite: number;
  reference?: string | null;
  userId?: string | null;
}

/**
 * Seule façon de changer un stock : un mouvement est créé et le niveau est mis à jour dans la
 * même transaction. Un stock négatif est accepté (vente hors ligne) et signalé par les rapports.
 */
export async function enregistrerMouvement(
  tx: Prisma.TransactionClient,
  m: Mouvement,
): Promise<void> {
  if (!Number.isSafeInteger(m.quantite) || m.quantite === 0) {
    throw new RangeError('Quantité de mouvement invalide.');
  }
  await tx.stockMovement.create({
    data: {
      organizationId: m.organizationId,
      productId: m.productId,
      storeId: m.storeId,
      type: m.type,
      quantity: m.quantite,
      reference: m.reference ?? null,
      userId: m.userId ?? null,
    },
  });
  await tx.stockLevel.upsert({
    where: { productId_storeId: { productId: m.productId, storeId: m.storeId } },
    create: {
      organizationId: m.organizationId,
      productId: m.productId,
      storeId: m.storeId,
      quantity: m.quantite,
    },
    update: { quantity: { increment: m.quantite } },
  });
}
