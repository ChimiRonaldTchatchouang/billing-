import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import type {
  creationCaisseSchema,
  creationMagasinSchema,
  modificationMagasinSchema,
} from '@caisse/shared';
import { AuditService } from '../audit/audit.service.js';
import { type Acteur, magasinAutorise } from '../auth/acteur.js';
import { codeLisible, jetonAleatoire, sha256 } from '../common/crypto.js';
import { conflit, introuvable, invalide } from '../common/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';

const DUREE_CODE_MS = 15 * 60 * 1000;

const magasinPublic = (s: {
  id: string;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  active: boolean;
}) => ({
  id: s.id,
  code: s.code,
  nom: s.name,
  adresse: s.address,
  telephone: s.phone,
  actif: s.active,
});

@Injectable()
export class OrganisationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async magasins(acteur: Acteur) {
    const storeId = magasinAutorise(acteur);
    const stores = await this.prisma.store.findMany({
      where: { organizationId: acteur.organizationId, ...(storeId ? { id: storeId } : {}) },
      orderBy: { code: 'asc' },
    });
    return stores.map(magasinPublic);
  }

  async creerMagasin(acteur: Acteur, d: z.infer<typeof creationMagasinSchema>) {
    const existe = await this.prisma.store.findFirst({
      where: { organizationId: acteur.organizationId, code: d.code },
    });
    if (existe) throw conflit('CODE_DEJA_UTILISE', `Le code magasin ${d.code} est déjà utilisé.`);
    const store = await this.prisma.store.create({
      data: {
        organizationId: acteur.organizationId,
        code: d.code,
        name: d.nom,
        address: d.adresse ?? null,
        phone: d.telephone ?? null,
      },
    });
    await this.audit.log(acteur, {
      action: 'MAGASIN_CREE',
      entite: 'store',
      entiteId: store.id,
      apres: d,
    });
    return magasinPublic(store);
  }

  async modifierMagasin(acteur: Acteur, id: string, d: z.infer<typeof modificationMagasinSchema>) {
    const avant = await this.prisma.store.findFirst({
      where: { id, organizationId: acteur.organizationId },
    });
    if (!avant) throw introuvable('Magasin');
    const store = await this.prisma.store.update({
      where: { id },
      data: { name: d.nom, address: d.adresse, phone: d.telephone, active: d.actif },
    });
    await this.audit.log(acteur, {
      action: 'MAGASIN_MODIFIE',
      entite: 'store',
      entiteId: id,
      avant: magasinPublic(avant),
      apres: magasinPublic(store),
    });
    return magasinPublic(store);
  }

  async caisses(acteur: Acteur, storeIdDemande?: string) {
    const storeId = magasinAutorise(acteur, storeIdDemande);
    const regs = await this.prisma.register.findMany({
      where: { organizationId: acteur.organizationId, ...(storeId ? { storeId } : {}) },
      include: { store: true },
      orderBy: [{ store: { code: 'asc' } }, { code: 'asc' }],
    });
    return regs.map((r) => ({
      id: r.id,
      code: r.code,
      magasin: { id: r.store.id, code: r.store.code, nom: r.store.name },
      enregistree: Boolean(r.deviceSecretHash),
      enregistreeLe: r.enrolledAt,
      derniereSynchronisation: r.lastSyncAt,
      actif: r.active,
    }));
  }

  async creerCaisse(acteur: Acteur, d: z.infer<typeof creationCaisseSchema>) {
    const store = await this.prisma.store.findFirst({
      where: { id: d.storeId, organizationId: acteur.organizationId },
    });
    if (!store) throw introuvable('Magasin');
    const existe = await this.prisma.register.findFirst({
      where: { storeId: store.id, code: d.code },
    });
    if (existe)
      throw conflit('CODE_DEJA_UTILISE', `La caisse ${d.code} existe déjà dans ce magasin.`);
    const reg = await this.prisma.register.create({
      data: { organizationId: acteur.organizationId, storeId: store.id, code: d.code },
    });
    await this.audit.log(acteur, {
      action: 'CAISSE_CREEE',
      entite: 'register',
      entiteId: reg.id,
      apres: d,
    });
    return { id: reg.id, code: reg.code, storeId: reg.storeId };
  }

  async modifierCaisse(acteur: Acteur, id: string, actif: boolean) {
    const reg = await this.trouverCaisse(acteur, id);
    await this.prisma.register.update({
      where: { id },
      // Désactiver une caisse invalide aussi son jeton d'appareil.
      data: actif
        ? { active: true }
        : { active: false, deviceSecretHash: null, enrollCodeHash: null },
    });
    await this.audit.log(acteur, {
      action: actif ? 'CAISSE_ACTIVEE' : 'CAISSE_DESACTIVEE',
      entite: 'register',
      entiteId: reg.id,
    });
  }

  /** Génère un code d'enregistrement à usage unique, valable 15 minutes. */
  async genererCodeEnregistrement(acteur: Acteur, id: string) {
    const reg = await this.trouverCaisse(acteur, id);
    if (!reg.active) throw invalide('CAISSE_INACTIVE', 'Cette caisse est désactivée.');
    const code = codeLisible();
    const expiresAt = new Date(Date.now() + DUREE_CODE_MS);
    await this.prisma.register.update({
      where: { id },
      data: { enrollCodeHash: sha256(code), enrollCodeExpiresAt: expiresAt },
    });
    await this.audit.log(acteur, {
      action: 'CAISSE_CODE_GENERE',
      entite: 'register',
      entiteId: id,
    });
    return { code, expireLe: expiresAt };
  }

  /** Le poste échange le code contre son jeton d'appareil. Tout ancien poste est révoqué. */
  async activerPoste(code: string) {
    const refus = invalide('CODE_INVALIDE', 'Code d’enregistrement invalide ou expiré.');
    const reg = await this.prisma.register.findUnique({
      where: { enrollCodeHash: sha256(code) },
      include: { store: true, organization: true },
    });
    if (!reg || !reg.active || !reg.enrollCodeExpiresAt || reg.enrollCodeExpiresAt < new Date()) {
      throw refus;
    }
    const secret = jetonAleatoire();
    const deviceId = jetonAleatoire(12);
    await this.prisma.register.update({
      where: { id: reg.id },
      data: {
        deviceId,
        deviceSecretHash: sha256(secret),
        enrollCodeHash: null,
        enrollCodeExpiresAt: null,
        enrolledAt: new Date(),
      },
    });
    await this.audit.log(
      {
        type: 'CAISSE',
        organizationId: reg.organizationId,
        userId: null,
        role: null,
        storeId: reg.storeId,
        registerId: reg.id,
      },
      { action: 'CAISSE_ENREGISTREE', entite: 'register', entiteId: reg.id, apres: { deviceId } },
    );
    return {
      jetonAppareil: `${reg.id}.${secret}`,
      caisse: { id: reg.id, code: reg.code, dernierNumero: reg.lastTicketSeq },
      magasin: {
        id: reg.store.id,
        code: reg.store.code,
        nom: reg.store.name,
        adresse: reg.store.address,
        telephone: reg.store.phone,
      },
      organisation: {
        nom: reg.organization.name,
        niu: reg.organization.niu,
        rccm: reg.organization.rccm,
        adresse: reg.organization.address,
        telephone: reg.organization.phone,
      },
    };
  }

  private async trouverCaisse(acteur: Acteur, id: string) {
    const reg = await this.prisma.register.findFirst({
      where: { id, organizationId: acteur.organizationId },
    });
    if (!reg) throw introuvable('Caisse');
    magasinAutorise(acteur, reg.storeId);
    return reg;
  }
}
