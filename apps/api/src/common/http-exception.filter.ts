import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ApiErrorBody } from './api-error.js';

const MESSAGES: Record<number, { code: string; message: string }> = {
  400: { code: 'REQUETE_INVALIDE', message: 'La demande est incomplète ou incorrecte.' },
  401: { code: 'NON_CONNECTE', message: 'Vous devez vous connecter pour continuer.' },
  403: { code: 'ACCES_REFUSE', message: 'Vous n’avez pas le droit de faire cette action.' },
  404: { code: 'INTROUVABLE', message: 'L’élément demandé est introuvable.' },
  409: { code: 'CONFLIT', message: 'Cette action entre en conflit avec des données existantes.' },
  429: {
    code: 'TROP_DE_DEMANDES',
    message: 'Trop de tentatives. Réessayez dans quelques minutes.',
  },
};

const ERREUR_INTERNE: ApiErrorBody = {
  code: 'ERREUR_INTERNE',
  message:
    'Une erreur inattendue est survenue. Réessayez ; si elle persiste, contactez le support.',
};

/** Convertit toute erreur au format standard { code, message, details }. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      if (isApiErrorBody(payload)) {
        res.status(status).json(payload);
        return;
      }
      const fallback = MESSAGES[status] ?? {
        code: 'ERREUR',
        message: 'La demande n’a pas pu aboutir.',
      };
      res.status(status).json(fallback satisfies ApiErrorBody);
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(ERREUR_INTERNE);
  }
}

function isApiErrorBody(v: unknown): v is ApiErrorBody {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as ApiErrorBody).code === 'string' &&
    typeof (v as ApiErrorBody).message === 'string'
  );
}
