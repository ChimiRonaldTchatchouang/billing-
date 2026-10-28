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
import {
  activationCaisseSchema,
  creationCaisseSchema,
  creationMagasinSchema,
  modificationCaisseSchema,
  modificationMagasinSchema,
} from '@caisse/shared';
import type { z } from 'zod';
import { type Acteur, GERANT_PLUS, TOUS } from '../auth/acteur.js';
import { ActeurCourant, Autoriser, Public } from '../auth/decorators.js';
import { ApiZodBody, ZodPipe } from '../common/zod.js';
import { LimiteAuth } from '../common/throttle.js';
import { OrganisationService } from './organisation.service.js';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('Organisation')
@ApiBearerAuth()
@Controller()
export class OrganisationController {
  constructor(private readonly service: OrganisationService) {}

  @Get('stores')
  @Autoriser(...TOUS)
  @ApiOperation({ summary: 'Magasins (un gérant ne voit que le sien)' })
  magasins(@ActeurCourant() a: Acteur) {
    return this.service.magasins(a);
  }

  @Post('stores')
  @Autoriser('DIRECTEUR')
  @ApiZodBody(creationMagasinSchema)
  creerMagasin(
    @ActeurCourant() a: Acteur,
    @Body(new ZodPipe(creationMagasinSchema)) b: z.infer<typeof creationMagasinSchema>,
  ) {
    return this.service.creerMagasin(a, b);
  }

  @Patch('stores/:id')
  @Autoriser('DIRECTEUR')
  @ApiZodBody(modificationMagasinSchema)
  modifierMagasin(
    @ActeurCourant() a: Acteur,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(modificationMagasinSchema)) b: z.infer<typeof modificationMagasinSchema>,
  ) {
    return this.service.modifierMagasin(a, id, b);
  }

  @Get('registers')
  @Autoriser(...GERANT_PLUS)
  caisses(@ActeurCourant() a: Acteur, @Query('storeId') storeId?: string) {
    return this.service.caisses(a, storeId);
  }

  @Post('registers')
  @Autoriser('DIRECTEUR')
  @ApiZodBody(creationCaisseSchema)
  creerCaisse(
    @ActeurCourant() a: Acteur,
    @Body(new ZodPipe(creationCaisseSchema)) b: z.infer<typeof creationCaisseSchema>,
  ) {
    return this.service.creerCaisse(a, b);
  }

  @Patch('registers/:id')
  @Autoriser('DIRECTEUR')
  @HttpCode(204)
  @ApiZodBody(modificationCaisseSchema)
  async modifierCaisse(
    @ActeurCourant() a: Acteur,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(modificationCaisseSchema)) b: z.infer<typeof modificationCaisseSchema>,
  ) {
    await this.service.modifierCaisse(a, id, b.actif);
  }

  @Post('registers/:id/enroll')
  @Autoriser(...GERANT_PLUS)
  @ApiOperation({
    summary: 'Générer le code d’enregistrement d’un poste (15 minutes, usage unique)',
  })
  enroler(@ActeurCourant() a: Acteur, @Param('id', uuid) id: string) {
    return this.service.genererCodeEnregistrement(a, id);
  }

  @Public()
  @LimiteAuth()
  @Post('registers/activate')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Le poste échange le code d’enregistrement contre son jeton d’appareil',
  })
  @ApiZodBody(activationCaisseSchema)
  activer(@Body(new ZodPipe(activationCaisseSchema)) b: z.infer<typeof activationCaisseSchema>) {
    return this.service.activerPoste(b.code);
  }
}
