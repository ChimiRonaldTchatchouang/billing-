import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Acteur } from '../auth/acteur.js';
import { ActeurCourant, Autoriser } from '../auth/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';

@ApiTags('Synchronisation')
@ApiBearerAuth()
@Autoriser('CAISSE')
@Controller('sync')
export class SyncController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Personnel pouvant se connecter sur cette caisse, avec l'empreinte de son PIN pour la
   * vérification hors ligne (décision 0004).
   */
  @Get('staff')
  @ApiOperation({ summary: 'Personnel du magasin et empreintes de PIN (caisse enregistrée)' })
  async personnel(@ActeurCourant() caisse: Acteur) {
    const users = await this.prisma.user.findMany({
      where: {
        organizationId: caisse.organizationId,
        active: true,
        pinHash: { not: null },
        OR: [{ storeId: caisse.storeId }, { role: 'DIRECTEUR' }],
      },
      orderBy: { name: 'asc' },
    });
    return users.map((u) => ({ id: u.id, nom: u.name, role: u.role, empreintePin: u.pinHash }));
  }
}
