import { Injectable } from '@nestjs/common';
import type { PaymentMode } from '@prisma/client';
import {
  type clotureSchema,
  montantRetour,
  type retourSchema,
  uuidv7,
  ventilerTtc,
} from '@caisse/shared';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { type Acteur, magasinAutorise } from '../auth/acteur.js';
import { PinService } from '../auth/pin.service.js';
import { conflit, interdit, introuvable, invalide } from '../common/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { enregistrerMouvement } from '../stock/mouvements.js';

const MODES: PaymentMode[] = ['ESPECES', 'ORANGE_MONEY', 'MTN_MOMO'];
type ParMode = Record<PaymentMode, number>;
const zero = (): ParMode => ({ ESPECES: 0, ORANGE_MONEY: 0, MTN_MOMO: 0 });

@Injectable()
export class CaisseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly pins: PinService,
  ) {}

  /** Reprise d'articles sur présentation du ticket (décision 0002), remboursée en espèces. */
  async retour(caisse: Acteur, venteId: string, d: z.infer<typeof retourSchema>) {
    const gerant = await this.pins.controler(caisse, d.gerantId, d.pin, 'GERANT');
    const origine = await this.prisma.sale.findFirst({
      where: { id: venteId, organizationId: caisse.organizationId },
      include: { register: true, lines: true, returns: { include: { lines: true } } },
    });
    if (!origine) throw introuvable('Vente');
    if (origine.register.storeId !== caisse.storeId)
      throw interdit('Ce ticket a été émis dans un autre magasin.');
    if (origine.status !== 'VALIDEE')
      throw invalide('RETOUR_IMPOSSIBLE', 'Ce ticket est lui-même un retour.');
    const session = await this.prisma.cashSession.findUnique({ where: { id: d.sessionId } });
    if (!session || session.registerId !== caisse.registerId || session.status !== 'OUVERTE') {
      throw invalide(
        'SESSION_FERMEE',
        'La caisse doit être ouverte (et synchronisée) pour un retour.',
      );
    }

    const dejaRendu = new Map<string, number>();
    for (const r of origine.returns)
      for (const l of r.lines) {
        if (l.originalLineId)
          dejaRendu.set(l.originalLineId, (dejaRendu.get(l.originalLineId) ?? 0) + l.quantity);
      }
    const lignes = d.lignes.map((demande) => {
      const l = origine.lines.find((x) => x.id === demande.ligneId);
      if (!l) throw introuvable('Ligne du ticket');
      const deja = dejaRendu.get(l.id) ?? 0;
      if (deja + demande.quantite > l.quantity) {
        throw invalide(
          'QUANTITE_RETOUR',
          `« ${l.label} » : il reste au plus ${l.quantity - deja} à reprendre.`,
        );
      }
      return {
        l,
        quantite: demande.quantite,
        montant: montantRetour(l.totalTtc, l.quantity, deja, demande.quantite),
      };
    });

    const ttcParTaux = new Map<number, number>();
    for (const x of lignes)
      ttcParTaux.set(x.l.vatRateBp, (ttcParTaux.get(x.l.vatRateBp) ?? 0) + x.montant);
    const ventil = [...ttcParTaux].map(([taux, ttc]) => ventilerTtc(ttc, taux));
    const ttc = ventil.reduce((a, v) => a + v.ttc, 0);
    const tva = ventil.reduce((a, v) => a + v.tva, 0);
    const numero = `${origine.ticketNumber}-R${origine.returns.length + 1}`;
    const id = uuidv7();

    await this.prisma.$transaction(async (tx) => {
      await tx.sale.create({
        data: {
          id,
          organizationId: caisse.organizationId,
          registerId: caisse.registerId!,
          userId: gerant.id,
          sessionId: session.id,
          ticketNumber: numero,
          totalHt: ttc - tva,
          totalVat: tva,
          totalTtc: ttc,
          status: 'RETOUR',
          originalSaleId: origine.id,
          createdAt: new Date(),
        },
      });
      await tx.saleLine.createMany({
        data: lignes.map((x) => ({
          organizationId: caisse.organizationId,
          saleId: id,
          productId: x.l.productId,
          label: x.l.label,
          unitPriceTtc: x.l.unitPriceTtc,
          quantity: x.quantite,
          unit: x.l.unit,
          vatRateBp: x.l.vatRateBp,
          totalTtc: x.montant,
          originalLineId: x.l.id,
        })),
      });
      await tx.payment.create({
        data: {
          organizationId: caisse.organizationId,
          saleId: id,
          mode: 'ESPECES',
          amount: ttc,
          status: 'VALIDE',
        },
      });
      for (const x of lignes) {
        await enregistrerMouvement(tx, {
          organizationId: caisse.organizationId,
          productId: x.l.productId,
          storeId: caisse.storeId!,
          type: 'RETOUR',
          quantite: x.quantite,
          reference: numero,
          userId: gerant.id,
        });
      }
      await this.audit.log(
        caisse,
        {
          action: 'RETOUR',
          entite: 'sale',
          entiteId: origine.id,
          userId: gerant.id,
          apres: {
            ticketRetour: numero,
            montant: ttc,
            motif: d.motif,
            lignes: lignes.map((x) => ({
              article: x.l.label,
              quantite: x.quantite,
              montant: x.montant,
            })),
          },
        },
        tx,
      );
    });
    return {
      id,
      numeroTicket: numero,
      ticketOrigine: origine.ticketNumber,
      rembourse: ttc,
      gerant: gerant.name,
      lignes: lignes.map((x) => ({
        libelle: x.l.label,
        quantite: x.quantite,
        unite: x.l.unit,
        montant: x.montant,
      })),
      parTaux: ventil,
    };
  }

  /** Montants attendus dans la caisse : fond + encaissements − remboursements, par mode. */
  private async attendus(sessionId: string, fond: number) {
    const lignes = await this.prisma.$queryRaw<
      { mode: PaymentMode; status: string; montant: bigint; tickets: bigint }[]
    >`
      SELECT p.mode, s.status, SUM(p.amount) AS montant, COUNT(DISTINCT s.id) AS tickets
      FROM payments p JOIN sales s ON s.id = p.sale_id
      WHERE s.session_id = ${sessionId}::uuid
      GROUP BY p.mode, s.status`;
    const encaisse = zero();
    const rembourse = zero();
    for (const l of lignes) {
      (l.status === 'RETOUR' ? rembourse : encaisse)[l.mode] += Number(l.montant);
    }
    const attendu = zero();
    for (const m of MODES) attendu[m] = encaisse[m] - rembourse[m] + (m === 'ESPECES' ? fond : 0);
    return { encaisse, rembourse, attendu };
  }

  async cloturer(caisse: Acteur, sessionId: string, d: z.infer<typeof clotureSchema>) {
    const gerant = await this.pins.controler(caisse, d.gerantId, d.pin, 'GERANT');
    const session = await this.prisma.cashSession.findUnique({ where: { id: sessionId } });
    if (!session || session.registerId !== caisse.registerId)
      throw introuvable('Session de caisse');
    if (session.status === 'FERMEE')
      throw conflit('SESSION_DEJA_FERMEE', 'Cette caisse est déjà clôturée.');
    const { attendu } = await this.attendus(session.id, session.openingFloat);
    const ecart = zero();
    for (const m of MODES) ecart[m] = d.compte[m] - attendu[m];
    const { count } = await this.prisma.cashSession.updateMany({
      where: { id: session.id, status: 'OUVERTE' },
      data: {
        status: 'FERMEE',
        closedById: gerant.id,
        closedAt: new Date(),
        countedByMode: { compte: d.compte, attendu, ecart },
        variance: ecart.ESPECES,
      },
    });
    if (count === 0) throw conflit('SESSION_DEJA_FERMEE', 'Cette caisse est déjà clôturée.');
    await this.audit.log(caisse, {
      action: 'CLOTURE_CAISSE',
      entite: 'cash_session',
      entiteId: session.id,
      userId: gerant.id,
      apres: { compte: d.compte, attendu, ecart },
    });
    return this.rapport(caisse, session.id);
  }

  async rapport(acteur: Acteur, sessionId: string) {
    const s = await this.prisma.cashSession.findFirst({
      where: { id: sessionId, organizationId: acteur.organizationId },
      include: { register: { include: { store: true } }, openedBy: true, closedBy: true },
    });
    if (!s) throw introuvable('Session de caisse');
    if (acteur.type === 'CAISSE') {
      if (s.registerId !== acteur.registerId) throw interdit();
    } else magasinAutorise(acteur, s.register.storeId);

    const { encaisse, rembourse, attendu } = await this.attendus(s.id, s.openingFloat);
    const [ventes] = await this.prisma.$queryRaw<
      { tickets: bigint; ttc: bigint | null; tva: bigint | null; remises: bigint | null }[]
    >`
      SELECT COUNT(*) AS tickets, SUM(total_ttc) AS ttc, SUM(total_vat) AS tva, SUM(discount) AS remises
      FROM sales WHERE session_id = ${s.id}::uuid AND status = 'VALIDEE'`;
    const [retours] = await this.prisma.$queryRaw<{ nombre: bigint; ttc: bigint | null }[]>`
      SELECT COUNT(*) AS nombre, SUM(total_ttc) AS ttc FROM sales WHERE session_id = ${s.id}::uuid AND status = 'RETOUR'`;
    const cloture = s.countedByMode as { compte: ParMode; ecart: ParMode } | null;
    return {
      id: s.id,
      caisse: `${s.register.store.code}-${s.register.code}`,
      statut: s.status,
      ouverteLe: s.openedAt,
      ouvertePar: s.openedBy.name,
      fermeeLe: s.closedAt,
      fermeePar: s.closedBy?.name ?? null,
      fondDeCaisse: s.openingFloat,
      tickets: Number(ventes?.tickets ?? 0),
      chiffreAffairesTtc: Number(ventes?.ttc ?? 0),
      tva: Number(ventes?.tva ?? 0),
      remises: Number(ventes?.remises ?? 0),
      retours: { nombre: Number(retours?.nombre ?? 0), montant: Number(retours?.ttc ?? 0) },
      encaisse,
      rembourse,
      attendu,
      compte: cloture?.compte ?? null,
      ecart: cloture?.ecart ?? null,
    };
  }

  async sessions(acteur: Acteur, storeId?: string, statut?: 'OUVERTE' | 'FERMEE') {
    const id = magasinAutorise(acteur, storeId);
    const ss = await this.prisma.cashSession.findMany({
      where: {
        organizationId: acteur.organizationId,
        ...(id ? { register: { storeId: id } } : {}),
        ...(statut ? { status: statut } : {}),
      },
      include: { register: { include: { store: true } }, openedBy: true, closedBy: true },
      orderBy: { openedAt: 'desc' },
      take: 100,
    });
    return ss.map((s) => ({
      id: s.id,
      caisse: `${s.register.store.code}-${s.register.code}`,
      statut: s.status,
      ouverteLe: s.openedAt,
      ouvertePar: s.openedBy.name,
      fermeeLe: s.closedAt,
      fermeePar: s.closedBy?.name ?? null,
      ecartEspeces: s.variance,
    }));
  }

  /** Vente retrouvée par son numéro de ticket (pour un retour en caisse). */
  async parTicket(acteur: Acteur, numero: string) {
    const v = await this.prisma.sale.findFirst({
      where: { organizationId: acteur.organizationId, ticketNumber: numero.toUpperCase() },
      include: { register: true },
    });
    if (!v) throw introuvable('Ticket');
    if (acteur.storeId && v.register.storeId !== acteur.storeId && acteur.role !== 'DIRECTEUR') {
      throw interdit('Ce ticket a été émis dans un autre magasin.');
    }
    return v.id;
  }
}
