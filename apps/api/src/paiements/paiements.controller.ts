import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { rapprochementGroupeSchema, rapprochementSchema } from '@caisse/shared';
import { z } from 'zod';
import { type Acteur, GERANT_PLUS } from '../auth/acteur.js';
import { ActeurCourant, Autoriser } from '../auth/decorators.js';
import { ApiZodBody, ApiZodQuery, ZodPipe } from '../common/zod.js';
import { PaiementsService } from './paiements.service.js';

const jour = z.iso.date();
const filtre = z.object({
  storeId: z.uuid().optional(),
  statut: z.enum(['A_RAPPROCHER', 'RAPPROCHE', 'ECART']).optional(),
  du: jour.optional(),
  au: jour.optional(),
});

@ApiTags('Paiements')
@ApiBearerAuth()
@Autoriser(...GERANT_PLUS)
@Controller('payments')
export class PaiementsController {
  constructor(private readonly service: PaiementsService) {}

  @Get()
  @ApiOperation({ summary: 'Paiements Mobile Money (par défaut : à rapprocher)' })
  @ApiZodQuery(filtre)
  liste(@ActeurCourant() a: Acteur, @Query(new ZodPipe(filtre)) q: z.infer<typeof filtre>) {
    return this.service.liste(a, q);
  }

  @Patch(':id/reconcile')
  @ApiZodBody(rapprochementSchema)
  rapprocher(
    @ActeurCourant() a: Acteur,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(rapprochementSchema)) b: z.infer<typeof rapprochementSchema>,
  ) {
    return this.service.rapprocher(a, [id], b.statut, b.note);
  }

  @Post('reconcile')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rapprocher plusieurs paiements à la fois' })
  @ApiZodBody(rapprochementGroupeSchema)
  rapprocherGroupe(
    @ActeurCourant() a: Acteur,
    @Body(new ZodPipe(rapprochementGroupeSchema)) b: z.infer<typeof rapprochementGroupeSchema>,
  ) {
    return this.service.rapprocher(a, b.ids, b.statut, b.note);
  }
}
