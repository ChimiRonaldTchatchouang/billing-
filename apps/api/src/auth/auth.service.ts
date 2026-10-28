import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from '@node-rs/argon2';
import type { User } from '@prisma/client';
import { AuditService } from '../audit/audit.service.js';
import { ApiError } from '../common/api-error.js';
import { jetonAleatoire, sha256 } from '../common/crypto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Acteur } from './acteur.js';

export const DUREE_ACCES_S = 15 * 60;
const DUREE_RENOUVELLEMENT_MS = 7 * 24 * 60 * 60 * 1000;

export interface Jetons {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export const hacherMotDePasse = (mdp: string) => hash(mdp);

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    @Inject('ARGON_DUMMY') private readonly empreinteFactice: Promise<string>,
  ) {}

  async connexion(email: string, motDePasse: string): Promise<Jetons> {
    const refus = new ApiError(
      HttpStatus.UNAUTHORIZED,
      'IDENTIFIANTS_INCORRECTS',
      'E-mail ou mot de passe incorrect.',
    );
    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), active: true, passwordHash: { not: null } },
    });
    // Vérification factice si l'utilisateur n'existe pas : même temps de réponse.
    const ok = await verify(user?.passwordHash ?? (await this.empreinteFactice), motDePasse);
    if (!user || !ok) throw refus;
    await this.audit.log(acteurDe(user), {
      action: 'CONNEXION',
      entite: 'user',
      entiteId: user.id,
    });
    return this.emettre(user);
  }

  async emettre(user: User, registerId?: string): Promise<Jetons> {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, ...(registerId ? { reg: registerId } : {}) },
      { expiresIn: DUREE_ACCES_S },
    );
    const refreshToken = jetonAleatoire();
    await this.prisma.refreshToken.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + DUREE_RENOUVELLEMENT_MS),
      },
    });
    return { accessToken, refreshToken, expiresIn: DUREE_ACCES_S };
  }

  /** Renouvelle les jetons. Un jeton déjà utilisé révoque toute la famille (vol probable). */
  async renouveler(refreshToken: string): Promise<Jetons> {
    const refus = new ApiError(
      HttpStatus.UNAUTHORIZED,
      'NON_CONNECTE',
      'Votre session a expiré. Reconnectez-vous.',
    );
    const stocke = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { user: true },
    });
    if (!stocke) throw refus;
    if (stocke.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: stocke.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw refus;
    }
    if (stocke.expiresAt < new Date() || !stocke.user.active) throw refus;
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: stocke.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) throw refus;
    return this.emettre(stocke.user);
  }

  async deconnexion(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revoquerTout(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

export function acteurDe(user: User, registerId: string | null = null): Acteur {
  return {
    type: 'UTILISATEUR',
    organizationId: user.organizationId,
    userId: user.id,
    role: user.role,
    storeId: user.storeId,
    registerId,
  };
}
