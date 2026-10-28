import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  calculerRendu,
  calculerVente,
  type EvenementSync,
  lireNumeroTicket,
  type ResultatSync,
  type SessionSync,
  type StatutReception,
  type venteSyncSchema,
} from '@caisse/shared';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import type { Acteur } from '../auth/acteur.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { enregistrerMouvement } from '../stock/mouvements.js';

type Vente = z.output<typeof venteSyncSchema>;

class Rejet extends Error {}

/**
 * Réception idempotente des ventes de la caisse : une vente n'est enregistrée que si son
 * identifiant est nouveau. Chaque vente est traitée dans sa propre transaction : un lot
 * partiellement invalide n'empêche pas d'enregistrer les autres ventes.
 */
@Injectable()
export class VentesSyncService {
  private readonly logger = new Logger(VentesSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async recevoir(
    caisse: Acteur,
    lot: { sessions: SessionSync[]; ventes: Vente[]; evenements: EvenementSync[] },
  ): Promise<ResultatSync> {
    const register = await this.prisma.register.findUniqueOrThrow({
      where: { id: caisse.registerId! },
      include: { store: true },
    });
    const resultat: ResultatSync = { sessions: [], ventes: [], evenements: [] };

    for (const s of lot.sessions) resultat.sessions.push(await this.session(caisse, s));
    for (const v of lot.ventes) resultat.ventes.push(await this.vente(caisse, register, v));
    for (const e of lot.evenements) resultat.evenements.push(await this.evenement(caisse, e));

    const sequences = lot.ventes
      .filter((v, i) => resultat.ventes[i]?.statut !== 'REJETEE')
      .map((v) => lireNumeroTicket(v.numeroTicket)?.sequence ?? 0);
    await this.prisma.$executeRaw`
      UPDATE registers SET last_sync_at = now(),
        last_ticket_seq = GREATEST(last_ticket_seq, ${Math.max(0, ...sequences)})
      WHERE id = ${register.id}::uuid`;
    return resultat;
  }

  private async employe(caisse: Acteur, userId: string) {
    // Un employé désactivé depuis la vente reste l'auteur de ses ventes passées.
    const u = await this.prisma.user.findFirst({
      where: { id: userId, organizationId: caisse.organizationId },
    });
    if (!u || (u.role !== 'DIRECTEUR' && u.storeId !== caisse.storeId)) {
      throw new Rejet('Employé inconnu dans ce magasin.');
    }
    return u;
  }

  private async session(caisse: Acteur, s: SessionSync) {
    const existante = await this.prisma.cashSession.findUnique({ where: { id: s.id } });
    if (existante) {
      return existante.registerId === caisse.registerId
        ? { id: s.id, statut: 'DEJA_RECUE' as const }
        : { id: s.id, statut: 'REJETEE' as const, message: 'Session d’une autre caisse.' };
    }
    try {
      await this.employe(caisse, s.ouvertePar);
      await this.prisma.cashSession.create({
        data: {
          id: s.id,
          organizationId: caisse.organizationId,
          registerId: caisse.registerId!,
          openedById: s.ouvertePar,
          openingFloat: s.fondDeCaisse,
          openedAt: new Date(s.ouverteLe),
        },
      });
      return { id: s.id, statut: 'ENREGISTREE' as const };
    } catch (e) {
      if (e instanceof Rejet) return { id: s.id, statut: 'REJETEE' as const, message: e.message };
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return { id: s.id, statut: 'DEJA_RECUE' as const };
      }
      throw e;
    }
  }

  private async vente(
    caisse: Acteur,
    register: { id: string; code: string; store: { code: string } },
    v: Vente,
  ): Promise<{ id: string; statut: StatutReception; message?: string }> {
    const existante = await this.prisma.sale.findUnique({
      where: { id: v.id },
      select: { registerId: true },
    });
    if (existante) {
      return existante.registerId === register.id
        ? { id: v.id, statut: 'DEJA_RECUE' }
        : {
            id: v.id,
            statut: 'REJETEE',
            message: 'Identifiant déjà utilisé par une autre caisse.',
          };
    }
    try {
      const prefixe = `${register.store.code}-${register.code}-`;
      if (!v.numeroTicket.startsWith(prefixe)) {
        throw new Rejet(`Le numéro de ticket doit commencer par ${prefixe}.`);
      }
      const vendeur = await this.employe(caisse, v.userId);
      const session = await this.prisma.cashSession.findUnique({ where: { id: v.sessionId } });
      if (!session || session.registerId !== register.id)
        throw new Rejet('Session de caisse inconnue.');

      const ids = [...new Set(v.lignes.map((l) => l.productId))];
      const produits = await this.prisma.product.findMany({
        where: { id: { in: ids }, organizationId: caisse.organizationId },
      });
      const parId = new Map(produits.map((p) => [p.id, p]));
      if (parId.size !== ids.length) throw new Rejet('Article inconnu dans le catalogue.');

      let totaux;
      let encaissement;
      try {
        totaux = calculerVente(v.lignes, v.remiseTicket);
        encaissement = calculerRendu(totaux.ttc, v.paiements);
      } catch (e) {
        throw new Rejet(e instanceof Error ? e.message : 'Vente incohérente.');
      }

      const approbateurs = [...new Set(v.approbations.map((a) => a.approuveePar))];
      for (const a of approbateurs) {
        const u = await this.employe(caisse, a);
        if (u.role === 'CAISSIER')
          throw new Rejet('Une validation a été faite par un employé qui n’est pas gérant.');
      }

      const ecartsPrix: { libelle: string; encaisse: number; catalogue: number }[] = [];
      await this.prisma.$transaction(async (tx) => {
        await tx.sale.create({
          data: {
            id: v.id,
            organizationId: caisse.organizationId,
            registerId: register.id,
            userId: vendeur.id,
            sessionId: session.id,
            ticketNumber: v.numeroTicket,
            totalHt: totaux.ht,
            totalVat: totaux.tva,
            totalTtc: totaux.ttc,
            discount: totaux.remise,
            changeGiven: encaissement.rendu,
            createdAt: new Date(v.creeLe),
          },
        });
        await tx.saleLine.createMany({
          data: v.lignes.map((l, i) => {
            const prixCatalogue = parId.get(l.productId)!.priceTtc;
            if (prixCatalogue !== l.prixUnitaireTtc) {
              ecartsPrix.push({
                libelle: l.libelle,
                encaisse: l.prixUnitaireTtc,
                catalogue: prixCatalogue,
              });
            }
            const calc = totaux.lignes[i]!;
            return {
              organizationId: caisse.organizationId,
              saleId: v.id,
              productId: l.productId,
              label: l.libelle,
              unitPriceTtc: l.prixUnitaireTtc,
              quantity: l.quantite,
              unit: l.unite,
              discount: calc.remiseLigne + calc.remiseTicket,
              vatRateBp: l.tauxTvaBp,
              totalTtc: calc.net,
              catalogPriceTtc: prixCatalogue !== l.prixUnitaireTtc ? prixCatalogue : null,
            };
          }),
        });

        const especes = v.paiements
          .filter((p) => p.mode === 'ESPECES')
          .reduce((a, p) => a + p.montant, 0);
        await tx.payment.createMany({
          data: [
            ...(especes > 0
              ? [
                  {
                    organizationId: caisse.organizationId,
                    saleId: v.id,
                    mode: 'ESPECES' as const,
                    amount: especes - encaissement.rendu,
                    status: 'VALIDE' as const,
                  },
                ]
              : []),
            ...v.paiements
              .filter((p) => p.mode !== 'ESPECES')
              .map((p) => ({
                organizationId: caisse.organizationId,
                saleId: v.id,
                mode: p.mode,
                amount: p.montant,
                customerPhone: p.numeroClient ?? null,
                externalRef: p.reference ?? null,
                status: 'A_RAPPROCHER' as const,
              })),
          ],
        });

        for (const l of v.lignes) {
          await enregistrerMouvement(tx, {
            organizationId: caisse.organizationId,
            productId: l.productId,
            storeId: caisse.storeId!,
            type: 'VENTE',
            quantite: -l.quantite,
            reference: v.numeroTicket,
            userId: vendeur.id,
          });
        }

        const acteur: Acteur = { ...caisse, userId: vendeur.id };
        for (const a of v.approbations) {
          await this.audit.log(
            acteur,
            {
              action: a.action,
              entite: 'sale',
              entiteId: v.id,
              userId: a.approuveePar,
              apres: { ticket: v.numeroTicket, caissier: vendeur.id, details: a.details, le: a.le },
            },
            tx,
          );
        }
        if (ecartsPrix.length) {
          await this.audit.log(
            acteur,
            {
              action: 'ECART_PRIX',
              entite: 'sale',
              entiteId: v.id,
              apres: { ticket: v.numeroTicket, lignes: ecartsPrix },
            },
            tx,
          );
        }
      });
      return { id: v.id, statut: 'ENREGISTREE' };
    } catch (e) {
      if (e instanceof Rejet) return { id: v.id, statut: 'REJETEE', message: e.message };
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        // Course entre deux envois du même lot, ou numéro de ticket réutilisé.
        const deja = await this.prisma.sale.findUnique({ where: { id: v.id } });
        return deja
          ? { id: v.id, statut: 'DEJA_RECUE' }
          : {
              id: v.id,
              statut: 'REJETEE',
              message: `Le numéro de ticket ${v.numeroTicket} est déjà utilisé.`,
            };
      }
      this.logger.error(`Vente ${v.id} : ${e instanceof Error ? e.stack : String(e)}`);
      throw e;
    }
  }

  private async evenement(caisse: Acteur, e: EvenementSync) {
    try {
      await this.employe(caisse, e.userId);
      await this.prisma.auditLog.create({
        data: {
          organizationId: caisse.organizationId,
          userId: e.approbation.approuveePar,
          registerId: caisse.registerId,
          action: e.approbation.action,
          entity: 'register',
          entityId: caisse.registerId,
          after: {
            caissier: e.userId,
            details: e.approbation.details ?? null,
            le: e.approbation.le,
          },
          clientEventId: e.id,
        },
      });
      return { id: e.id, statut: 'ENREGISTREE' as const };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return { id: e.id, statut: 'DEJA_RECUE' as const };
      }
      if (err instanceof Rejet) return { id: e.id, statut: 'REJETEE' as const };
      throw err;
    }
  }
}
