import { HttpStatus, Injectable } from '@nestjs/common';
import type { Role, User } from '@prisma/client';
import { verifierPin } from '@caisse/shared';
import { AuditService } from '../audit/audit.service.js';
import { ApiError } from '../common/api-error.js';
import { interdit } from '../common/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Acteur } from './acteur.js';

const ESSAIS_MAX = 3;
const BLOCAGE_MS = 5 * 60 * 1000;
const NIVEAU: Record<Role, number> = { CAISSIER: 1, GERANT: 2, DIRECTEUR: 3 };

/** Contrôle d'un PIN avec blocage après 3 erreurs pendant 5 minutes. */
@Injectable()
export class PinService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Vérifie le PIN d'un utilisateur du magasin de la caisse. Avec `roleMin`, exige aussi ce
   * niveau (ex. GERANT pour une remise ou une clôture).
   */
  async controler(
    acteur: Acteur,
    userId: string,
    pin: string,
    roleMin: Role = 'CAISSIER',
  ): Promise<User> {
    const refus = new ApiError(HttpStatus.UNAUTHORIZED, 'PIN_INCORRECT', 'PIN incorrect.');
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId: acteur.organizationId, active: true },
    });
    if (!user?.pinHash) throw refus;
    if (user.role !== 'DIRECTEUR' && user.storeId !== acteur.storeId) throw refus;

    const maintenant = Date.now();
    if (user.lockedUntil && user.lockedUntil.getTime() > maintenant) {
      const minutes = Math.ceil((user.lockedUntil.getTime() - maintenant) / 60_000);
      throw new ApiError(
        HttpStatus.TOO_MANY_REQUESTS,
        'PIN_BLOQUE',
        `Trop d’erreurs de PIN. Réessayez dans ${minutes} minute${minutes > 1 ? 's' : ''}.`,
      );
    }

    if (!(await verifierPin(pin, user.pinHash))) {
      const echecs = user.pinFailures + 1;
      const bloque = echecs >= ESSAIS_MAX;
      await this.prisma.user.update({
        where: { id: user.id },
        data: bloque
          ? { pinFailures: 0, lockedUntil: new Date(maintenant + BLOCAGE_MS) }
          : { pinFailures: echecs },
      });
      if (bloque) {
        await this.audit.log(acteur, {
          action: 'PIN_BLOQUE',
          entite: 'user',
          entiteId: user.id,
          userId: user.id,
        });
        throw new ApiError(
          HttpStatus.TOO_MANY_REQUESTS,
          'PIN_BLOQUE',
          'Trop d’erreurs de PIN. Réessayez dans 5 minutes.',
        );
      }
      throw refus;
    }

    if (user.pinFailures > 0 || user.lockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { pinFailures: 0, lockedUntil: null },
      });
    }
    if (NIVEAU[user.role] < NIVEAU[roleMin]) {
      throw interdit('Cette action doit être validée par le PIN d’un gérant.');
    }
    return user;
  }
}
