import { Injectable } from '@nestjs/common';
import type { PaymentStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service.js';
import { type Acteur, magasinAutorise } from '../auth/acteur.js';
import { conflit, introuvable } from '../common/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { bornesJour } from '../ventes/ventes.service.js';

export interface FiltrePaiements {
  storeId?: string;
  statut?: PaymentStatus;
  du?: string;
  au?: string;
}

/** Rapprochement quotidien des paiements Mobile Money avec le relevé de l'opérateur (décision 0001). */
@Injectable()
export class PaiementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async liste(acteur: Acteur, f: FiltrePaiements) {
    const storeId = magasinAutorise(acteur, f.storeId);
    const where: Prisma.PaymentWhereInput = {
      organizationId: acteur.organizationId,
      mode: { in: ['ORANGE_MONEY', 'MTN_MOMO'] },
      status: f.statut ?? 'A_RAPPROCHER',
      sale: {
        ...(storeId ? { register: { storeId } } : {}),
        ...(f.du || f.au
          ? {
              createdAt: {
                ...(f.du ? { gte: bornesJour(f.du) } : {}),
                ...(f.au ? { lte: bornesJour(f.au, true) } : {}),
              },
            }
          : {}),
      },
    };
    const ps = await this.prisma.payment.findMany({
      where,
      include: { sale: { include: { register: { include: { store: true } }, user: true } } },
      orderBy: { sale: { createdAt: 'asc' } },
      take: 500,
    });
    return ps.map((p) => ({
      id: p.id,
      mode: p.mode,
      montant: p.amount,
      numeroClient: p.customerPhone,
      reference: p.externalRef,
      statut: p.status,
      note: p.reconciliationNote,
      ticket: p.sale.ticketNumber,
      venteId: p.sale.id,
      le: p.sale.createdAt,
      caisse: `${p.sale.register.store.code}-${p.sale.register.code}`,
      caissier: p.sale.user.name,
    }));
  }

  async rapprocher(acteur: Acteur, ids: string[], statut: 'RAPPROCHE' | 'ECART', note?: string) {
    const ps = await this.prisma.payment.findMany({
      where: { id: { in: ids }, organizationId: acteur.organizationId },
      include: { sale: { include: { register: true } } },
    });
    if (ps.length !== ids.length) throw introuvable('Paiement');
    for (const p of ps) {
      magasinAutorise(acteur, p.sale.register.storeId);
      if (p.mode === 'ESPECES')
        throw conflit(
          'PAIEMENT_ESPECES',
          'Les paiements en espèces se contrôlent à la clôture de caisse.',
        );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.updateMany({
        where: { id: { in: ids } },
        data: {
          status: statut,
          reconciledBy: acteur.userId,
          reconciledAt: new Date(),
          reconciliationNote: note ?? null,
        },
      });
      for (const p of ps) {
        await this.audit.log(
          acteur,
          {
            action: statut === 'ECART' ? 'PAIEMENT_ECART' : 'PAIEMENT_RAPPROCHE',
            entite: 'payment',
            entiteId: p.id,
            avant: { statut: p.status },
            apres: {
              statut,
              note,
              ticket: p.sale.ticketNumber,
              reference: p.externalRef,
              montant: p.amount,
            },
          },
          tx,
        );
      }
    });
    return { traites: ids.length };
  }
}
