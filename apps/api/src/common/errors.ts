import { HttpStatus } from '@nestjs/common';
import { ApiError } from './api-error.js';

export const introuvable = (quoi: string) =>
  new ApiError(HttpStatus.NOT_FOUND, 'INTROUVABLE', `${quoi} introuvable.`);

export const interdit = (message = 'Vous n’avez pas le droit de faire cette action.') =>
  new ApiError(HttpStatus.FORBIDDEN, 'ACCES_REFUSE', message);

export const conflit = (code: string, message: string) =>
  new ApiError(HttpStatus.CONFLICT, code, message);

export const invalide = (code: string, message: string, details?: unknown[]) =>
  new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, code, message, details);
