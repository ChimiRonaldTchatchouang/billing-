import { Injectable } from '@nestjs/common';
import { ApiError } from '../common/api-error.js';
import { egaliteSure, sha256 } from '../common/crypto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Acteur } from './acteur.js';

/** Authentifie une caisse enregistrée à partir de son jeton d'appareil « registerId.secret ». */
@Injectable()
export class AppareilService {
  constructor(private readonly prisma: PrismaService) {}

  async authentifier(jeton: string): Promise<Acteur> {
    const refus = new ApiError(
      401,
      'CAISSE_NON_ENREGISTREE',
      'Ce poste n’est pas (ou plus) enregistré. Demandez à un gérant de l’enregistrer à nouveau.',
    );
    const [registerId, secret] = jeton.split('.');
    if (!registerId || !secret || !/^[0-9a-f-]{36}$/.test(registerId)) throw refus;
    const reg = await this.prisma.register.findUnique({
      where: { id: registerId },
      include: { store: true },
    });
    if (!reg?.active || !reg.store.active || !reg.deviceSecretHash) throw refus;
    if (!egaliteSure(sha256(secret), reg.deviceSecretHash)) throw refus;
    return {
      type: 'CAISSE',
      organizationId: reg.organizationId,
      userId: null,
      role: null,
      storeId: reg.storeId,
      registerId: reg.id,
    };
  }
}
