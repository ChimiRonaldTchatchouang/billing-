import { Injectable } from '@nestjs/common';
import { Prisma, type User } from '@prisma/client';
import { hacherPin } from '@caisse/shared';
import type { creationUtilisateurSchema, modificationUtilisateurSchema } from '@caisse/shared';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import type { Acteur } from '../auth/acteur.js';
import { AuthService, hacherMotDePasse } from '../auth/auth.service.js';
import { conflit, introuvable, invalide } from '../common/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';

type Creation = z.infer<typeof creationUtilisateurSchema>;
type Modification = z.infer<typeof modificationUtilisateurSchema>;

export const utilisateurPublic = (u: User & { store?: { code: string; name: string } | null }) => ({
  id: u.id,
  nom: u.name,
  email: u.email,
  role: u.role,
  storeId: u.storeId,
  magasin: u.store ? { code: u.store.code, nom: u.store.name } : null,
  actif: u.active,
  aUnPin: Boolean(u.pinHash),
  bloqueJusqua: u.lockedUntil,
});

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
  ) {}

  async liste(acteur: Acteur) {
    const users = await this.prisma.user.findMany({
      where: { organizationId: acteur.organizationId },
      include: { store: true },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
    return users.map(utilisateurPublic);
  }

  async creer(acteur: Acteur, d: Creation) {
    await this.verifierMagasin(acteur, d.storeId ?? null);
    try {
      const user = await this.prisma.user.create({
        data: {
          organizationId: acteur.organizationId,
          name: d.nom,
          email: d.email ?? null,
          passwordHash: d.motDePasse ? await hacherMotDePasse(d.motDePasse) : null,
          pinHash: d.pin ? await hacherPin(d.pin) : null,
          role: d.role,
          storeId: d.storeId ?? null,
        },
        include: { store: true },
      });
      const pub = utilisateurPublic(user);
      await this.audit.log(acteur, {
        action: 'UTILISATEUR_CREE',
        entite: 'user',
        entiteId: user.id,
        apres: pub,
      });
      return pub;
    } catch (e) {
      throw this.traduire(e);
    }
  }

  async modifier(acteur: Acteur, id: string, d: Modification) {
    const avant = await this.prisma.user.findFirst({
      where: { id, organizationId: acteur.organizationId },
      include: { store: true },
    });
    if (!avant) throw introuvable('Utilisateur');
    if (id === acteur.userId && (d.actif === false || (d.role && d.role !== avant.role))) {
      throw invalide(
        'ACTION_SUR_SOI',
        'Vous ne pouvez pas désactiver votre compte ni changer votre rôle.',
      );
    }

    const role = d.role ?? avant.role;
    const storeId = d.storeId !== undefined ? d.storeId : avant.storeId;
    if (role === 'DIRECTEUR' && storeId) {
      throw invalide('MAGASIN_INATTENDU', 'Un directeur n’est rattaché à aucun magasin.');
    }
    if (role !== 'DIRECTEUR' && !storeId) {
      throw invalide('MAGASIN_OBLIGATOIRE', 'Choisissez le magasin de rattachement.');
    }
    await this.verifierMagasin(acteur, storeId);

    try {
      const user = await this.prisma.user.update({
        where: { id },
        data: {
          name: d.nom,
          email: d.email,
          passwordHash: d.motDePasse ? await hacherMotDePasse(d.motDePasse) : undefined,
          pinHash: d.pin ? await hacherPin(d.pin) : undefined,
          ...(d.pin ? { pinFailures: 0, lockedUntil: null } : {}),
          role,
          storeId,
          active: d.actif,
        },
        include: { store: true },
      });
      if (d.actif === false || d.motDePasse) await this.auth.revoquerTout(id);
      const pub = utilisateurPublic(user);
      await this.audit.log(acteur, {
        action: 'UTILISATEUR_MODIFIE',
        entite: 'user',
        entiteId: id,
        avant: utilisateurPublic(avant),
        apres: {
          ...pub,
          ...(d.pin ? { pinModifie: true } : {}),
          ...(d.motDePasse ? { motDePasseModifie: true } : {}),
        },
      });
      return pub;
    } catch (e) {
      throw this.traduire(e);
    }
  }

  private async verifierMagasin(acteur: Acteur, storeId: string | null) {
    if (!storeId) return;
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, organizationId: acteur.organizationId },
    });
    if (!store) throw introuvable('Magasin');
  }

  private traduire(e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return conflit('EMAIL_DEJA_UTILISE', 'Cette adresse e-mail est déjà utilisée.');
    }
    return e;
  }
}
