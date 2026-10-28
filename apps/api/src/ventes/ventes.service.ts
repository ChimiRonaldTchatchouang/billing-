import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { type Acteur, magasinAutorise } from '../auth/acteur.js';
import { introuvable } from '../common/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface FiltreVentes {
  storeId?: string;
  du?: string;
  au?: string;
  recherche?: string;
  page: number;
  parPage: number;
}

/** Bornes d'une journée à Douala (UTC+1, sans heure d'été). */
export function bornesJour(jour: string, fin = false): Date {
  return new Date(`${jour}T${fin ? '23:59:59.999' : '00:00:00.000'}+01:00`);
}

@Injectable()
export class VentesService {
  constructor(private readonly prisma: PrismaService) {}

  filtre(acteur: Acteur, f: Omit<FiltreVentes, 'page' | 'parPage'>): Prisma.SaleWhereInput {
    const storeId = magasinAutorise(acteur, f.storeId);
    return {
      organizationId: acteur.organizationId,
      ...(storeId ? { register: { storeId } } : {}),
      ...(f.du || f.au
        ? {
            createdAt: {
              ...(f.du ? { gte: bornesJour(f.du) } : {}),
              ...(f.au ? { lte: bornesJour(f.au, true) } : {}),
            },
          }
        : {}),
      ...(f.recherche ? { ticketNumber: { contains: f.recherche.toUpperCase() } } : {}),
    };
  }

  async liste(acteur: Acteur, f: FiltreVentes) {
    const where = this.filtre(acteur, f);
    const [total, ventes] = await Promise.all([
      this.prisma.sale.count({ where }),
      this.prisma.sale.findMany({
        where,
        include: {
          register: { include: { store: true } },
          user: true,
          payments: true,
          invoice: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (f.page - 1) * f.parPage,
        take: f.parPage,
      }),
    ]);
    return {
      total,
      page: f.page,
      parPage: f.parPage,
      ventes: ventes.map((v) => ({
        id: v.id,
        numeroTicket: v.ticketNumber,
        creeLe: v.createdAt,
        recueLe: v.syncedAt,
        magasin: v.register.store.code,
        caisse: v.register.code,
        caissier: v.user.name,
        totalTtc: v.totalTtc,
        remise: v.discount,
        statut: v.status,
        modes: [...new Set(v.payments.map((p) => p.mode))],
        facture: v.invoice?.number ?? null,
      })),
    };
  }

  async detail(acteur: Acteur, id: string) {
    const v = await this.prisma.sale.findFirst({
      where: { id, organizationId: acteur.organizationId },
      include: {
        register: { include: { store: true } },
        user: true,
        lines: { orderBy: { id: 'asc' } },
        payments: true,
        invoice: true,
        originalSale: true,
        returns: { include: { lines: true } },
      },
    });
    if (!v) throw introuvable('Vente');
    magasinAutorise(acteur, v.register.storeId);
    const rendues = new Map<string, number>();
    for (const r of v.returns)
      for (const l of r.lines) {
        if (l.originalLineId)
          rendues.set(l.originalLineId, (rendues.get(l.originalLineId) ?? 0) + l.quantity);
      }
    return {
      id: v.id,
      numeroTicket: v.ticketNumber,
      creeLe: v.createdAt,
      recueLe: v.syncedAt,
      statut: v.status,
      magasin: { id: v.register.store.id, code: v.register.store.code, nom: v.register.store.name },
      caisse: v.register.code,
      caissier: v.user.name,
      sessionId: v.sessionId,
      totalHt: v.totalHt,
      totalTva: v.totalVat,
      totalTtc: v.totalTtc,
      remise: v.discount,
      rendu: v.changeGiven,
      venteOrigine: v.originalSale
        ? { id: v.originalSale.id, numeroTicket: v.originalSale.ticketNumber }
        : null,
      retours: v.returns.map((r) => ({
        id: r.id,
        numeroTicket: r.ticketNumber,
        totalTtc: r.totalTtc,
        creeLe: r.createdAt,
      })),
      lignes: v.lines.map((l) => ({
        id: l.id,
        productId: l.productId,
        libelle: l.label,
        prixUnitaireTtc: l.unitPriceTtc,
        quantite: l.quantity,
        unite: l.unit,
        remise: l.discount,
        tauxTvaBp: l.vatRateBp,
        totalTtc: l.totalTtc,
        prixCatalogue: l.catalogPriceTtc,
        quantiteRendue: rendues.get(l.id) ?? 0,
      })),
      paiements: v.payments.map((p) => ({
        id: p.id,
        mode: p.mode,
        montant: p.amount,
        numeroClient: p.customerPhone,
        reference: p.externalRef,
        statut: p.status,
      })),
      facture: v.invoice
        ? {
            id: v.invoice.id,
            numero: v.invoice.number,
            client: v.invoice.customerName,
            envoyeeLe: v.invoice.sentAt,
          }
        : null,
    };
  }
}
