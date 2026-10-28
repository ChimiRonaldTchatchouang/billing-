import { createHmac } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { creationFactureSchema } from '@caisse/shared';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { type Acteur, magasinAutorise } from '../auth/acteur.js';
import { egaliteSure } from '../common/crypto.js';
import { conflit, interdit, introuvable, invalide } from '../common/errors.js';
import { ENV, type Env } from '../config/env.js';
import { gabarit, MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type DonneesFacture, genererPdf } from './pdf.js';

const DUREE_LIEN_S = 7 * 24 * 3600;

@Injectable()
export class FacturesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private verifierAcces(acteur: Acteur, storeId: string) {
    if (acteur.type === 'CAISSE') {
      if (acteur.storeId !== storeId)
        throw interdit('Cette vente a été faite dans un autre magasin.');
    } else magasinAutorise(acteur, storeId);
  }

  /**
   * Facture d'une vente (ou avoir d'un retour). Numérotation continue sans trou : le compteur de
   * l'organisation est incrémenté dans la même transaction que la création. Une facture émise
   * n'est jamais modifiée ; un retour donne un avoir lié à la facture d'origine.
   */
  async creer(acteur: Acteur, saleId: string, d: z.infer<typeof creationFactureSchema>) {
    const vente = await this.prisma.sale.findFirst({
      where: { id: saleId, organizationId: acteur.organizationId },
      include: { register: true, invoice: true, originalSale: { include: { invoice: true } } },
    });
    if (!vente) throw introuvable('Vente');
    this.verifierAcces(acteur, vente.register.storeId);
    if (vente.invoice)
      throw conflit('FACTURE_EXISTANTE', `Cette vente a déjà la facture ${vente.invoice.number}.`);
    const avoir = vente.status === 'RETOUR';
    const origine = avoir ? vente.originalSale?.invoice : null;
    if (avoir && !origine) {
      throw invalide(
        'AVOIR_SANS_FACTURE',
        'Le ticket d’origine n’a pas de facture : un avoir n’est pas nécessaire.',
      );
    }
    const client = origine
      ? {
          raisonSociale: origine.customerName,
          niu: origine.customerNiu ?? undefined,
          adresse: origine.customerAddress ?? undefined,
          email: origine.customerEmail ?? undefined,
        }
      : d.client;

    const facture = await this.prisma.$transaction(async (tx) => {
      // La ligne de l'organisation reste verrouillée jusqu'à la fin de la transaction : deux
      // factures simultanées ne peuvent pas recevoir le même numéro.
      const compteur = avoir
        ? await tx.organization.update({
            where: { id: acteur.organizationId },
            data: { lastCreditSeq: { increment: 1 } },
          })
        : await tx.organization.update({
            where: { id: acteur.organizationId },
            data: { lastInvoiceSeq: { increment: 1 } },
          });
      const seq = avoir ? compteur.lastCreditSeq : compteur.lastInvoiceSeq;
      const numero = `${avoir ? 'AV' : 'FA'}-${String(seq).padStart(6, '0')}`;
      const f = await tx.invoice.create({
        data: {
          organizationId: acteur.organizationId,
          saleId: vente.id,
          kind: avoir ? 'AVOIR' : 'FACTURE',
          originalInvoiceId: origine?.id ?? null,
          number: numero,
          customerName: client.raisonSociale,
          customerNiu: client.niu?.toUpperCase() ?? null,
          customerAddress: client.adresse ?? null,
          customerEmail: client.email?.toLowerCase() ?? null,
        },
      });
      await this.audit.log(
        acteur,
        {
          action: avoir ? 'AVOIR_EMIS' : 'FACTURE_EMISE',
          entite: 'invoice',
          entiteId: f.id,
          apres: { numero, ticket: vente.ticketNumber, client },
        },
        tx,
      );
      return f;
    });
    return this.resume(facture.id);
  }

  private async resume(id: string) {
    const f = await this.prisma.invoice.findUniqueOrThrow({
      where: { id },
      include: { sale: true },
    });
    return {
      id: f.id,
      numero: f.number,
      type: f.kind,
      client: {
        raisonSociale: f.customerName,
        niu: f.customerNiu,
        adresse: f.customerAddress,
        email: f.customerEmail,
      },
      ticket: f.sale.ticketNumber,
      totalTtc: f.sale.totalTtc,
      emiseLe: f.createdAt,
      envoyeeLe: f.sentAt,
    };
  }

  async donnees(
    acteur: Acteur | null,
    id: string,
  ): Promise<{ donnees: DonneesFacture; storeId: string; email: string | null; numero: string }> {
    const f = await this.prisma.invoice.findFirst({
      where: { id, ...(acteur ? { organizationId: acteur.organizationId } : {}) },
      include: {
        sale: {
          include: {
            lines: { orderBy: { id: 'asc' } },
            payments: true,
            register: { include: { store: { include: { organization: true } } } },
          },
        },
      },
    });
    if (!f) throw introuvable('Facture');
    const origine = f.originalInvoiceId
      ? await this.prisma.invoice.findUnique({ where: { id: f.originalInvoiceId } })
      : null;
    const store = f.sale.register.store;
    const org = store.organization;
    return {
      storeId: store.id,
      email: f.customerEmail,
      numero: f.number,
      donnees: {
        type: f.kind,
        numero: f.number,
        date: f.createdAt,
        factureOrigine: origine?.number ?? null,
        vendeur: {
          nom: org.name,
          niu: org.niu,
          rccm: org.rccm,
          adresse: store.address ?? org.address,
          telephone: store.phone ?? org.phone,
          magasin: store.name,
        },
        client: { raisonSociale: f.customerName, niu: f.customerNiu, adresse: f.customerAddress },
        ticket: f.sale.ticketNumber,
        lignes: f.sale.lines.map((l) => ({
          libelle: l.label,
          quantite: l.quantity,
          unite: l.unit,
          prixUnitaireTtc: l.unitPriceTtc,
          remise: l.discount,
          tauxTvaBp: l.vatRateBp,
          totalTtc: l.totalTtc,
        })),
        paiements: f.sale.payments.map((p) => ({ mode: p.mode, montant: p.amount })),
      },
    };
  }

  async pdf(acteur: Acteur, id: string) {
    const { donnees, storeId, numero } = await this.donnees(acteur, id);
    this.verifierAcces(acteur, storeId);
    return { numero, contenu: await genererPdf(donnees) };
  }

  private signature(id: string, exp: number) {
    return createHmac('sha256', this.env.PDF_LINK_SECRET)
      .update(`${id}.${exp}`)
      .digest('base64url');
  }

  /** Lien public signé vers le PDF, valable 7 jours, et message WhatsApp prérempli. */
  async lien(acteur: Acteur, id: string) {
    const { storeId, numero, donnees } = await this.donnees(acteur, id);
    this.verifierAcces(acteur, storeId);
    const exp = Math.floor(Date.now() / 1000) + DUREE_LIEN_S;
    const url = `${this.env.PUBLIC_API_URL.replace(/\/$/, '')}/api/v1/invoices/${id}/pdf/public?exp=${exp}&sig=${this.signature(id, exp)}`;
    const texte = `${donnees.vendeur.nom} — ${donnees.type === 'AVOIR' ? 'avoir' : 'facture'} ${numero} : ${url}`;
    return {
      url,
      expireLe: new Date(exp * 1000),
      whatsapp: `https://wa.me/?text=${encodeURIComponent(texte)}`,
    };
  }

  async pdfPublic(id: string, exp: number, sig: string) {
    const refus = interdit('Ce lien n’est plus valable. Demandez un nouveau lien au magasin.');
    if (
      !Number.isInteger(exp) ||
      exp < Date.now() / 1000 ||
      !egaliteSure(sig, this.signature(id, exp))
    )
      throw refus;
    const { donnees, numero } = await this.donnees(null, id);
    return { numero, contenu: await genererPdf(donnees) };
  }

  async envoyer(acteur: Acteur, id: string, email?: string) {
    const { storeId, email: emailClient, numero, donnees } = await this.donnees(acteur, id);
    this.verifierAcces(acteur, storeId);
    const a = email ?? emailClient;
    if (!a) throw invalide('EMAIL_MANQUANT', 'Indiquez l’adresse e-mail du client.');
    const type = donnees.type === 'AVOIR' ? 'Avoir' : 'Facture';
    await this.mail.envoyer({
      a,
      sujet: `${type} ${numero} — ${donnees.vendeur.nom}`,
      html: gabarit(`${type} ${numero}`, [
        `Bonjour ${donnees.client.raisonSociale},`,
        `Vous trouverez ci-joint votre ${type.toLowerCase()} ${numero} (ticket ${donnees.ticket}).`,
        `Merci pour votre confiance. — ${donnees.vendeur.nom}, ${donnees.vendeur.magasin}`,
      ]),
      pieceJointe: { nom: `${numero}.pdf`, contenu: await genererPdf(donnees) },
    });
    await this.prisma.invoice.update({ where: { id }, data: { sentAt: new Date() } });
    await this.audit.log(acteur, {
      action: 'FACTURE_ENVOYEE',
      entite: 'invoice',
      entiteId: id,
      apres: { a },
    });
    return this.resume(id);
  }
}
