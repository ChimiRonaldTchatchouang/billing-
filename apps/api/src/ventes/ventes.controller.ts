import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { type Acteur, GERANT_PLUS } from '../auth/acteur.js';
import { ActeurCourant, Autoriser } from '../auth/decorators.js';
import { ApiZodQuery, ZodPipe } from '../common/zod.js';
import { VentesService } from './ventes.service.js';

const jour = z.iso.date({ message: 'Date au format AAAA-MM-JJ.' });
export const filtreVentesSchema = z.object({
  storeId: z.uuid().optional(),
  du: jour.optional(),
  au: jour.optional(),
  recherche: z.string().trim().max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
  parPage: z.coerce.number().int().min(1).max(200).default(50),
});

@ApiTags('Ventes')
@ApiBearerAuth()
@Controller('sales')
export class VentesController {
  constructor(private readonly service: VentesService) {}

  @Get()
  @Autoriser(...GERANT_PLUS)
  @ApiZodQuery(filtreVentesSchema)
  liste(
    @ActeurCourant() a: Acteur,
    @Query(new ZodPipe(filtreVentesSchema)) q: z.infer<typeof filtreVentesSchema>,
  ) {
    return this.service.liste(a, q);
  }

  @Get(':id')
  @Autoriser(...GERANT_PLUS, 'CAISSE')
  detail(@ActeurCourant() a: Acteur, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.detail(a, id);
  }
}
