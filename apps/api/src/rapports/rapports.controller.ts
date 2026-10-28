import { Controller, Get, Header, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { periodeSchema } from '@caisse/shared';
import { z } from 'zod';
import { type Acteur, GERANT_PLUS } from '../auth/acteur.js';
import { ActeurCourant, Autoriser } from '../auth/decorators.js';
import { ApiZodQuery, ZodPipe } from '../common/zod.js';
import { RapportsService } from './rapports.service.js';

const filtreMagasin = z.object({ storeId: z.uuid().optional() });

@ApiTags('Rapports')
@ApiBearerAuth()
@Autoriser(...GERANT_PLUS)
@Controller('reports')
export class RapportsController {
  constructor(private readonly service: RapportsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Tableau de bord du jour : ventes, 7 derniers jours, alertes' })
  @ApiZodQuery(filtreMagasin)
  tableau(
    @ActeurCourant() a: Acteur,
    @Query(new ZodPipe(filtreMagasin)) q: z.infer<typeof filtreMagasin>,
  ) {
    return this.service.tableauDeBord(a, q.storeId);
  }

  @Get('sales')
  @ApiOperation({
    summary: 'Ventes d’une période : par jour, par mode de paiement, par taux de TVA',
  })
  @ApiZodQuery(periodeSchema)
  ventes(
    @ActeurCourant() a: Acteur,
    @Query(new ZodPipe(periodeSchema)) q: z.infer<typeof periodeSchema>,
  ) {
    return this.service.ventes(a, q);
  }

  @Get('sales/export')
  @ApiProduces('text/csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'Export CSV des lignes de vente (ouvrable dans Excel)' })
  @ApiZodQuery(periodeSchema)
  async export(
    @ActeurCourant() a: Acteur,
    @Query(new ZodPipe(periodeSchema)) q: z.infer<typeof periodeSchema>,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.set('Content-Disposition', `attachment; filename="ventes-${q.du}-${q.au}.csv"`);
    return new StreamableFile(Buffer.from(await this.service.exportCsv(a, q), 'utf8'));
  }
}
