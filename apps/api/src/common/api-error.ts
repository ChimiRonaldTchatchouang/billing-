import { HttpException, HttpStatus } from '@nestjs/common';

/** Format standard des erreurs de l'API. Le message est en français, lisible par l'utilisateur. */
export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown[];
}

export class ApiError extends HttpException {
  constructor(status: HttpStatus, code: string, message: string, details?: unknown[]) {
    super({ code, message, ...(details ? { details } : {}) } satisfies ApiErrorBody, status);
  }
}
