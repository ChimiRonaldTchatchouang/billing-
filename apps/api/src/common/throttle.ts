import { Throttle } from '@nestjs/throttler';

/** Limite des tentatives sur la connexion, le PIN et l'enregistrement d'un poste (par minute et par adresse). */
export const LimiteAuth = () =>
  Throttle({
    default: { limit: () => Number(process.env.THROTTLE_AUTH_LIMIT ?? 10), ttl: 60_000 },
  });
