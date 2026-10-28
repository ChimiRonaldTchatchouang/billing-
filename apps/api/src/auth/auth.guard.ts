import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { ApiError } from '../common/api-error.js';
import { interdit } from '../common/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type Acteur, type Autorisation, TOUS } from './acteur.js';
import { AUTORISATIONS, PUBLIC } from './decorators.js';
import { AppareilService } from './appareil.service.js';

const nonConnecte = () =>
  new ApiError(401, 'NON_CONNECTE', 'Votre session a expiré. Reconnectez-vous.');

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly appareils: AppareilService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const cibles = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, cibles)) return true;
    const autorises =
      this.reflector.getAllAndOverride<Autorisation[]>(AUTORISATIONS, cibles) ?? TOUS;

    const req = ctx.switchToHttp().getRequest<Request & { acteur?: Acteur }>();
    const [schema, jeton] = (req.headers.authorization ?? '').split(' ');
    if (!jeton) throw nonConnecte();

    let acteur: Acteur;
    if (schema === 'Caisse') {
      acteur = await this.appareils.authentifier(jeton);
      if (!autorises.includes('CAISSE'))
        throw interdit('Cette action n’est pas possible depuis une caisse.');
    } else if (schema === 'Bearer') {
      acteur = await this.utilisateur(jeton);
      if (!acteur.role || !autorises.includes(acteur.role)) throw interdit();
    } else {
      throw nonConnecte();
    }
    req.acteur = acteur;
    return true;
  }

  private async utilisateur(jeton: string): Promise<Acteur> {
    let charge: { sub: string; reg?: string };
    try {
      charge = await this.jwt.verifyAsync(jeton);
    } catch {
      throw nonConnecte();
    }
    // Relu à chaque requête : une désactivation ou un changement de rôle s'applique immédiatement.
    const user = await this.prisma.user.findUnique({ where: { id: charge.sub } });
    if (!user?.active) throw nonConnecte();
    return {
      type: 'UTILISATEUR',
      organizationId: user.organizationId,
      userId: user.id,
      role: user.role,
      storeId: user.storeId,
      registerId: charge.reg ?? null,
    };
  }
}
