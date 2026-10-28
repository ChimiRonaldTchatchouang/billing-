import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { clotureSchema, retourSchema, sessionSyncSchema } from '@caisse/shared';
import { z } from 'zod';
import { type Acteur, GERANT_PLUS } from '../auth/acteur.js';
import { ActeurCourant, Autoriser } from '../auth/decorators.js';
import { ApiZodBody, ApiZodQuery, ZodPipe } from '../common/zod.js';
import { VentesSyncService } from '../sync/ventes-sync.service.js';
import { VentesService } from '../ventes/ventes.service.js';
import { CaisseService } from './caisse.service.js';

const uuid = new ParseUUIDPipe();
const filtreSessions = z.object({
  storeId: z.uuid().optional(),
  statut: z.enum(['OUVERTE', 'FERMEE']).optional(),
});

@ApiTags('Caisse')
@ApiBearerAuth()
@Controller()
export class CaisseController {
  constructor(
    private readonly service: CaisseService,
    private readonly ventes: VentesService,
    private readonly sync: VentesSyncService,
  ) {}

  @Post('cash-sessions/open')
  @Autoriser('CAISSE')
  @HttpCode(200)
  @ApiOperation({ summary: 'Ouvrir une session (aussi possible hors ligne via POST /sync/sales)' })
  @ApiZodBody(sessionSyncSchema)
  async ouvrir(
    @ActeurCourant() caisse: Acteur,
    @Body(new ZodPipe(sessionSyncSchema)) b: z.infer<typeof sessionSyncSchema>,
  ) {
    const r = await this.sync.recevoir(caisse, { sessions: [b], ventes: [], evenements: [] });
    return r.sessions[0];
  }

  @Post('cash-sessions/:id/close')
  @Autoriser('CAISSE')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Clôturer la caisse : montants comptés par mode, PIN du gérant, écart calculé',
  })
  @ApiZodBody(clotureSchema)
  cloturer(
    @ActeurCourant() caisse: Acteur,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(clotureSchema)) b: z.infer<typeof clotureSchema>,
  ) {
    return this.service.cloturer(caisse, id, b);
  }

  @Get('cash-sessions/:id/report')
  @Autoriser(...GERANT_PLUS, 'CAISSE')
  rapport(@ActeurCourant() a: Acteur, @Param('id', uuid) id: string) {
    return this.service.rapport(a, id);
  }

  @Get('cash-sessions')
  @Autoriser(...GERANT_PLUS)
  @ApiZodQuery(filtreSessions)
  sessions(
    @ActeurCourant() a: Acteur,
    @Query(new ZodPipe(filtreSessions)) q: z.infer<typeof filtreSessions>,
  ) {
    return this.service.sessions(a, q.storeId, q.statut);
  }

  @Get('sales/ticket/:numero')
  @Autoriser(...GERANT_PLUS, 'CAISSE')
  @ApiOperation({ summary: 'Retrouver une vente par son numéro de ticket' })
  async parTicket(@ActeurCourant() a: Acteur, @Param('numero') numero: string) {
    return this.ventes.detail(a, await this.service.parTicket(a, numero));
  }

  @Post('sales/:id/return')
  @Autoriser('CAISSE')
  @ApiOperation({
    summary: 'Retour d’articles sur ticket (PIN du gérant, remboursement en espèces)',
  })
  @ApiZodBody(retourSchema)
  retour(
    @ActeurCourant() caisse: Acteur,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(retourSchema)) b: z.infer<typeof retourSchema>,
  ) {
    return this.service.retour(caisse, id, b);
  }
}
