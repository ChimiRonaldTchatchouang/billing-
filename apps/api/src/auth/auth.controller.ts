import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  connexionPinSchema,
  connexionSchema,
  motDePasseOublieSchema,
  reinitialisationSchema,
  renouvellementSchema,
} from '@caisse/shared';
import type { z } from 'zod';
import { introuvable } from '../common/errors.js';
import { ApiZodBody, ZodPipe } from '../common/zod.js';
import { LimiteAuth } from '../common/throttle.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Acteur } from './acteur.js';
import { AuthService } from './auth.service.js';
import { ActeurCourant, Autoriser, Public } from './decorators.js';
import { PinService } from './pin.service.js';

@ApiTags('Authentification')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly pins: PinService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @LimiteAuth()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Connexion au back-office par e-mail et mot de passe' })
  @ApiZodBody(connexionSchema)
  login(@Body(new ZodPipe(connexionSchema)) body: z.infer<typeof connexionSchema>) {
    return this.auth.connexion(body.email, body.motDePasse);
  }

  @Autoriser('CAISSE')
  @LimiteAuth()
  @Post('pin')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Connexion par PIN, uniquement depuis une caisse enregistrée' })
  @ApiZodBody(connexionPinSchema)
  async pin(
    @ActeurCourant() caisse: Acteur,
    @Body(new ZodPipe(connexionPinSchema)) body: z.infer<typeof connexionPinSchema>,
  ) {
    const user = await this.pins.controler(caisse, body.userId, body.pin);
    return this.auth.emettre(user, caisse.registerId ?? undefined);
  }

  @Public()
  @LimiteAuth()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Renouveler les jetons' })
  @ApiZodBody(renouvellementSchema)
  refresh(@Body(new ZodPipe(renouvellementSchema)) body: z.infer<typeof renouvellementSchema>) {
    return this.auth.renouveler(body.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Déconnexion : révoque le jeton de renouvellement' })
  @ApiZodBody(renouvellementSchema)
  async logout(
    @Body(new ZodPipe(renouvellementSchema)) body: z.infer<typeof renouvellementSchema>,
  ) {
    await this.auth.deconnexion(body.refreshToken);
  }

  @Public()
  @LimiteAuth()
  @Post('forgot')
  @HttpCode(204)
  @ApiOperation({ summary: 'Recevoir par e-mail un lien de réinitialisation du mot de passe' })
  @ApiZodBody(motDePasseOublieSchema)
  async oublie(
    @Body(new ZodPipe(motDePasseOublieSchema)) body: z.infer<typeof motDePasseOublieSchema>,
  ) {
    await this.auth.motDePasseOublie(body.email);
  }

  @Public()
  @LimiteAuth()
  @Post('reset')
  @HttpCode(204)
  @ApiOperation({ summary: 'Choisir un nouveau mot de passe avec le lien reçu' })
  @ApiZodBody(reinitialisationSchema)
  async reinitialiser(
    @Body(new ZodPipe(reinitialisationSchema)) body: z.infer<typeof reinitialisationSchema>,
  ) {
    await this.auth.reinitialiser(body.jeton, body.motDePasse);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Utilisateur connecté' })
  async me(@ActeurCourant() acteur: Acteur) {
    const user = await this.prisma.user.findUnique({
      where: { id: acteur.userId! },
      include: { store: true, organization: true },
    });
    if (!user) throw introuvable('Utilisateur');
    return {
      id: user.id,
      nom: user.name,
      email: user.email,
      role: user.role,
      magasin: user.store
        ? { id: user.store.id, code: user.store.code, nom: user.store.name }
        : null,
      organisation: { id: user.organization.id, nom: user.organization.name },
    };
  }
}
