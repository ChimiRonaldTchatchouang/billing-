import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ajustementSchema, receptionSchema } from '@caisse/shared';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { type Acteur, magasinAutorise } from '../auth/acteur.js';
import { introuvable, invalide } from '../common/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { enregistrerMouvement } from './mouvements.js';

export interface FiltreStock {
  storeId?: string;
  recherche?: string;
  alerte?: 'true' | 'false';
  page: number;
  parPage: number;
}

@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async magasin(acteur: Acteur, storeId?: string) {
    const id = magasinAutorise(acteur, storeId);
    if (!id) throw invalide('MAGASIN_OBLIGATOIRE', 'Choisissez un magasin.');
    const store = await this.prisma.store.findFirst({
      where: { id, organizationId: acteur.organizationId },
    });
    if (!store) throw introuvable('Magasin');
    return store;
  }

  /** Niveaux de stock d'un magasin. Les articles jamais mouvementés apparaissent à zéro. */
  async niveaux(acteur: Acteur, f: FiltreStock) {
    const store = await this.magasin(acteur, f.storeId);
    const recherche = f.recherche ? `%${f.recherche}%` : null;
    const alerte = f.alerte === 'true';
    const conditions = Prisma.sql`
      p.organization_id = ${acteur.organizationId}::uuid AND p.active
      ${recherche ? Prisma.sql`AND (p.name ILIKE ${recherche} OR p.barcode LIKE ${recherche})` : Prisma.empty}
      ${alerte ? Prisma.sql`AND COALESCE(s.quantity, 0) <= (CASE WHEN p.unit = 'KG' THEN p.alert_threshold * 1000 ELSE p.alert_threshold END)` : Prisma.empty}`;
    const base = Prisma.sql`FROM products p
      LEFT JOIN stock_levels s ON s.product_id = p.id AND s.store_id = ${store.id}::uuid
      WHERE ${conditions}`;
    const [compte] = await this.prisma.$queryRaw<
      { total: bigint }[]
    >`SELECT count(*) AS total ${base}`;
    const lignes = await this.prisma.$queryRaw<
      {
        id: string;
        barcode: string;
        name: string;
        unit: 'PIECE' | 'KG';
        alert_threshold: number;
        last_purchase_price: number | null;
        price_ttc: number;
        quantity: number;
      }[]
    >`SELECT p.id, p.barcode, p.name, p.unit, p.alert_threshold, p.last_purchase_price, p.price_ttc,
             COALESCE(s.quantity, 0) AS quantity
      ${base}
      ORDER BY COALESCE(s.quantity, 0) - (CASE WHEN p.unit = 'KG' THEN p.alert_threshold * 1000 ELSE p.alert_threshold END), p.name
      LIMIT ${f.parPage} OFFSET ${(f.page - 1) * f.parPage}`;
    return {
      magasin: { id: store.id, code: store.code, nom: store.name },
      total: Number(compte?.total ?? 0),
      page: f.page,
      parPage: f.parPage,
      articles: lignes.map((l) => {
        const seuil = l.unit === 'KG' ? l.alert_threshold * 1000 : l.alert_threshold;
        return {
          productId: l.id,
          codeBarres: l.barcode,
          nom: l.name,
          unite: l.unit,
          quantite: l.quantity,
          seuilAlerte: l.alert_threshold,
          prixTtc: l.price_ttc,
          dernierPrixAchat: l.last_purchase_price,
          enAlerte: l.quantity <= seuil,
          negatif: l.quantity < 0,
        };
      }),
    };
  }

  async mouvements(acteur: Acteur, storeId: string | undefined, productId: string) {
    const store = await this.magasin(acteur, storeId);
    const ms = await this.prisma.stockMovement.findMany({
      where: { organizationId: acteur.organizationId, storeId: store.id, productId },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return ms.map((m) => ({
      id: m.id,
      type: m.type,
      quantite: m.quantity,
      reference: m.reference,
      par: m.user?.name ?? null,
      le: m.createdAt,
    }));
  }

  async receptionner(acteur: Acteur, d: z.infer<typeof receptionSchema>) {
    const store = await this.magasin(acteur, d.storeId);
    const ids = [...new Set(d.lignes.map((l) => l.productId))];
    const produits = await this.prisma.product.findMany({
      where: { id: { in: ids }, organizationId: acteur.organizationId },
    });
    if (produits.length !== ids.length) throw introuvable('Article');
    const receipt = await this.prisma.$transaction(async (tx) => {
      const r = await tx.receipt.create({
        data: {
          organizationId: acteur.organizationId,
          storeId: store.id,
          supplierName: d.fournisseur,
          userId: acteur.userId!,
          lines: {
            create: d.lignes.map((l) => ({
              organizationId: acteur.organizationId,
              productId: l.productId,
              quantity: l.quantite,
              purchasePrice: l.prixAchat,
            })),
          },
        },
      });
      for (const l of d.lignes) {
        await enregistrerMouvement(tx, {
          organizationId: acteur.organizationId,
          productId: l.productId,
          storeId: store.id,
          type: 'RECEPTION',
          quantite: l.quantite,
          reference: `Réception ${d.fournisseur}`,
          userId: acteur.userId,
        });
        await tx.product.update({
          where: { id: l.productId },
          data: { lastPurchasePrice: l.prixAchat },
        });
      }
      await this.audit.log(
        acteur,
        { action: 'RECEPTION', entite: 'receipt', entiteId: r.id, apres: d },
        tx,
      );
      return r;
    });
    return { id: receipt.id, lignes: d.lignes.length };
  }

  async receptions(acteur: Acteur, storeId?: string) {
    const id = magasinAutorise(acteur, storeId);
    const rs = await this.prisma.receipt.findMany({
      where: { organizationId: acteur.organizationId, ...(id ? { storeId: id } : {}) },
      include: { store: true, user: true, lines: { include: { product: true } } },
      orderBy: { receivedAt: 'desc' },
      take: 100,
    });
    return rs.map((r) => ({
      id: r.id,
      magasin: r.store.code,
      fournisseur: r.supplierName,
      par: r.user.name,
      le: r.receivedAt,
      montantAchat: r.lines.reduce((a, l) => a + l.quantity * l.purchasePrice, 0),
      lignes: r.lines.map((l) => ({
        article: l.product.name,
        quantite: l.quantity,
        prixAchat: l.purchasePrice,
      })),
    }));
  }

  async ajuster(acteur: Acteur, d: z.infer<typeof ajustementSchema>) {
    const store = await this.magasin(acteur, d.storeId);
    const produit = await this.prisma.product.findFirst({
      where: { id: d.productId, organizationId: acteur.organizationId },
    });
    if (!produit) throw introuvable('Article');
    return this.prisma.$transaction(async (tx) => {
      // Verrou sur le niveau de stock : l'écart d'inventaire est calculé sur une valeur stable.
      const [niveau] = await tx.$queryRaw<{ quantity: number }[]>`
        SELECT quantity FROM stock_levels WHERE product_id = ${produit.id}::uuid AND store_id = ${store.id}::uuid FOR UPDATE`;
      const avant = niveau?.quantity ?? 0;
      const variation = d.quantite ?? d.quantiteReelle! - avant;
      if (variation !== 0) {
        await enregistrerMouvement(tx, {
          organizationId: acteur.organizationId,
          productId: produit.id,
          storeId: store.id,
          type: 'AJUSTEMENT',
          quantite: variation,
          reference: d.motif,
          userId: acteur.userId,
        });
      }
      await this.audit.log(
        acteur,
        {
          action: 'AJUSTEMENT_STOCK',
          entite: 'product',
          entiteId: produit.id,
          avant: { magasin: store.code, quantite: avant },
          apres: { magasin: store.code, quantite: avant + variation, motif: d.motif },
        },
        tx,
      );
      return { avant, apres: avant + variation, variation };
    });
  }
}
