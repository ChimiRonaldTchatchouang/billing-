import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { creationUtilisateurSchema, modificationUtilisateurSchema } from '@caisse/shared';
import type { z } from 'zod';
import type { Acteur } from '../auth/acteur.js';
import { ActeurCourant, Autoriser } from '../auth/decorators.js';
import { ApiZodBody, ZodPipe } from '../common/zod.js';
import { UsersService } from './users.service.js';

@ApiTags('Utilisateurs')
@ApiBearerAuth()
@Autoriser('DIRECTEUR')
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get()
  liste(@ActeurCourant() a: Acteur) {
    return this.service.liste(a);
  }

  @Post()
  @ApiZodBody(creationUtilisateurSchema)
  creer(
    @ActeurCourant() a: Acteur,
    @Body(new ZodPipe(creationUtilisateurSchema)) b: z.infer<typeof creationUtilisateurSchema>,
  ) {
    return this.service.creer(a, b);
  }

  @Patch(':id')
  @ApiZodBody(modificationUtilisateurSchema)
  modifier(
    @ActeurCourant() a: Acteur,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(modificationUtilisateurSchema))
    b: z.infer<typeof modificationUtilisateurSchema>,
  ) {
    return this.service.modifier(a, id, b);
  }
}
