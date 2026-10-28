import { z } from 'zod';

z.config(z.locales.fr());

const liste = (defaut: string) =>
  z
    .string()
    .default(defaut)
    .transform((v) =>
      v
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    );

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url({ message: 'DATABASE_URL doit être une adresse PostgreSQL valide.' }),
  CORS_ORIGINS: liste('http://localhost:5173'),
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, { message: 'JWT_ACCESS_SECRET doit comporter au moins 32 caractères.' }),
  PDF_LINK_SECRET: z
    .string()
    .min(32, { message: 'PDF_LINK_SECRET doit comporter au moins 32 caractères.' }),
  /** Adresse publique de l'API, pour les liens signés (PDF, WhatsApp). */
  PUBLIC_API_URL: z.url().default('http://localhost:3000'),
  /** Adresse de l'application web, pour les liens dans les e-mails. */
  PUBLIC_WEB_URL: z.url().default('http://localhost:5173'),
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().default('Caisse <onboarding@resend.dev>'),
  SENTRY_DSN: z.string().optional(),
  /** Tentatives autorisées par minute et par adresse sur la connexion, le PIN et l'enrôlement. */
  THROTTLE_AUTH_LIMIT: z.coerce.number().int().positive().default(10),
});

export type Env = z.infer<typeof envSchema>;

/** Lit et vérifie les variables d'environnement ; arrête le démarrage si l'une est invalide. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((i) => `- ${i.path.join('.')} : ${i.message}`)
      .join('\n');
    throw new Error(`Configuration invalide :\n${details}`);
  }
  return result.data;
}

export const ENV = Symbol('ENV');
