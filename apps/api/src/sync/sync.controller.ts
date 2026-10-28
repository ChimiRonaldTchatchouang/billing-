import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { lotVentesSchema } from '@caisse/shared';
import { z } from 'zod';
import type { Acteur } from '../auth/acteur.js';
import { ActeurCourant, Autoriser } from '../auth/decorators.js';
import { CatalogueService } from '../catalogue/catalogue.service.js';
import { ApiZodBody, ApiZodQuery, ZodPipe } from '../common/zod.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { VentesSyncService } from './ventes-sync.service.js';

const catalogueQuery = z.object({
  since: z.iso.datetime({ offset: true }).optional(),
  apresId: z.uuid().optional(),
  limite: z.coerce.number().int().min(1).max(2000).default(1000),
});

@ApiTags('Synchronisation')
@ApiBearerAuth()
@Autoriser('CAISSE')
@Controller('sync')
export class SyncController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogue: CatalogueService,
    private readonly ventes: VentesSyncService,
  ) {}

  @Post('sales')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Envoyer un lot de sessions, ventes et événements (idempotent)',
    description:
      'Chaque élément reçoit un statut : ENREGISTREE, DEJA_RECUE (renvoi ignoré) ou REJETEE (avec message). Les éléments rejetés n’empêchent pas d’enregistrer les autres.',
  })
  @ApiZodBody(lotVentesSchema)
  envoyerVentes(
    @ActeurCourant() caisse: Acteur,
    @Body(new ZodPipe(lotVentesSchema)) lot: z.output<typeof lotVentesSchema>,
  ) {
    return this.ventes.recevoir(caisse, lot);
  }

  /**
   * Articles modifiés depuis `since` (inclus les désactivés, à retirer de la copie locale).
   * Tant que `suivant` n'est pas nul, rappeler avec `since` et `apresId` de `suivant`.
   */
  @Get('catalog')
  @ApiOperation({
    summary: 'Catalogue modifié depuis la dernière synchronisation (caisse enregistrée)',
  })
  @ApiZodQuery(catalogueQuery)
  catalogueModifie(
    @ActeurCourant() caisse: Acteur,
    @Query(new ZodPipe(catalogueQuery)) q: z.infer<typeof catalogueQuery>,
  ) {
    return this.catalogue.pourCaisse(
      caisse,
      q.since ? new Date(q.since) : null,
      q.apresId ?? null,
      q.limite,
    );
  }

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
