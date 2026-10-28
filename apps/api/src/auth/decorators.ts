import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Acteur, Autorisation } from './acteur.js';

export const PUBLIC = 'acces:public';
export const AUTORISATIONS = 'acces:autorisations';

/** Route accessible sans jeton. */
export const Public = () => SetMetadata(PUBLIC, true);

/** Liste des rôles (et/ou 'CAISSE') autorisés. Sans ce décorateur : tout utilisateur connecté. */
export const Autoriser = (...autorisations: Autorisation[]) =>
  SetMetadata(AUTORISATIONS, autorisations);

export const ActeurCourant = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): Acteur => ctx.switchToHttp().getRequest().acteur,
);
