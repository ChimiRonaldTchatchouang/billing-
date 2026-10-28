import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ajustementSchema, receptionSchema } from '@caisse/shared';
import { z } from 'zod';
import { type Acteur, GERANT_PLUS } from '../auth/acteur.js';
import { ActeurCourant, Autoriser } from '../auth/decorators.js';
import { ApiZodBody, ApiZodQuery, ZodPipe } from '../common/zod.js';
import { StockService } from './stock.service.js';

const filtreStock = z.object({
  storeId: z.uuid().optional(),
  recherche: z.string().trim().max(100).optional(),
  alerte: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  parPage: z.coerce.number().int().min(1).max(200).default(50),
});
const filtreMagasin = z.object({ storeId: z.uuid().optional() });

@ApiTags('Stock')
@ApiBearerAuth()
@Autoriser(...GERANT_PLUS)
@Controller()
export class StockController {
  constructor(private readonly service: StockService) {}

  @Get('stock')
  @ApiOperation({ summary: 'Niveaux de stock d’un magasin (alerte = sous le seuil)' })
  @ApiZodQuery(filtreStock)
  niveaux(
    @ActeurCourant() a: Acteur,
    @Query(new ZodPipe(filtreStock)) q: z.infer<typeof filtreStock>,
  ) {
    return this.service.niveaux(a, q);
  }

  @Get('stock/:productId/movements')
  @ApiZodQuery(filtreMagasin)
  mouvements(
    @ActeurCourant() a: Acteur,
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Query(new ZodPipe(filtreMagasin)) q: z.infer<typeof filtreMagasin>,
  ) {
    return this.service.mouvements(a, q.storeId, productId);
  }

  @Get('receipts')
  @ApiZodQuery(filtreMagasin)
  receptions(
    @ActeurCourant() a: Acteur,
    @Query(new ZodPipe(filtreMagasin)) q: z.infer<typeof filtreMagasin>,
  ) {
    return this.service.receptions(a, q.storeId);
  }

  @Post('receipts')
  @ApiOperation({ summary: 'Réception de marchandises (entrée en stock, prix d’achat mis à jour)' })
  @ApiZodBody(receptionSchema)
  receptionner(
    @ActeurCourant() a: Acteur,
    @Body(new ZodPipe(receptionSchema)) b: z.infer<typeof receptionSchema>,
  ) {
    return this.service.receptionner(a, b);
  }

  @Post('stock/adjustments')
  @ApiOperation({ summary: 'Ajustement de stock (casse, vol) ou inventaire (quantité comptée)' })
  @ApiZodBody(ajustementSchema)
  ajuster(
    @ActeurCourant() a: Acteur,
    @Body(new ZodPipe(ajustementSchema)) b: z.infer<typeof ajustementSchema>,
  ) {
    return this.service.ajuster(a, b);
  }
}
