import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { creationFactureSchema, envoiFactureSchema } from '@caisse/shared';
import { z } from 'zod';
import { type Acteur, TOUS } from '../auth/acteur.js';
import { ActeurCourant, Autoriser, Public } from '../auth/decorators.js';
import { ApiZodBody, ZodPipe } from '../common/zod.js';
import { FacturesService } from './factures.service.js';

const uuid = new ParseUUIDPipe();
const lienSchema = z.object({ exp: z.coerce.number().int(), sig: z.string().min(10).max(100) });

function fichier(res: Response, numero: string, contenu: Buffer) {
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="${numero}.pdf"`,
  });
  return new StreamableFile(contenu);
}

@ApiTags('Factures')
@ApiBearerAuth()
@Autoriser(...TOUS, 'CAISSE')
@Controller()
export class FacturesController {
  constructor(private readonly service: FacturesService) {}

  @Post('sales/:id/invoice')
  @ApiOperation({ summary: 'Émettre la facture d’une vente (ou l’avoir d’un retour)' })
  @ApiZodBody(creationFactureSchema)
  creer(
    @ActeurCourant() a: Acteur,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(creationFactureSchema)) b: z.infer<typeof creationFactureSchema>,
  ) {
    return this.service.creer(a, id, b);
  }

  @Get('invoices/:id/pdf')
  @ApiProduces('application/pdf')
  async pdf(
    @ActeurCourant() a: Acteur,
    @Param('id', uuid) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { numero, contenu } = await this.service.pdf(a, id);
    return fichier(res, numero, contenu);
  }

  @Post('invoices/:id/link')
  @ApiOperation({ summary: 'Lien signé vers le PDF (7 jours) et lien WhatsApp prérempli' })
  lien(@ActeurCourant() a: Acteur, @Param('id', uuid) id: string) {
    return this.service.lien(a, id);
  }

  @Public()
  @Get('invoices/:id/pdf/public')
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: 'PDF par lien signé (pour le client, sans connexion)' })
  async pdfPublic(
    @Param('id', uuid) id: string,
    @Query(new ZodPipe(lienSchema)) q: z.infer<typeof lienSchema>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { numero, contenu } = await this.service.pdfPublic(id, q.exp, q.sig);
    return fichier(res, numero, contenu);
  }

  @Post('invoices/:id/send')
  @ApiOperation({ summary: 'Envoyer la facture par e-mail (PDF joint)' })
  @ApiZodBody(envoiFactureSchema)
  envoyer(
    @ActeurCourant() a: Acteur,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(envoiFactureSchema)) b: z.infer<typeof envoiFactureSchema>,
  ) {
    return this.service.envoyer(a, id, b.email);
  }
}
