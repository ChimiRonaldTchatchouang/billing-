import { z } from 'zod';

const fcfa = z.number().int({ message: 'Montant en FCFA entiers.' }).nonnegative();

export const creationCategorieSchema = z.object({ nom: z.string().trim().min(1).max(80) });

export const creationArticleSchema = z.object({
  codeBarres: z
    .string()
    .trim()
    .regex(/^[0-9A-Za-z-]{3,32}$/, {
      message: 'Code-barres invalide (3 à 32 chiffres ou lettres).',
    }),
  nom: z.string().trim().min(1, { message: 'Le nom est obligatoire.' }).max(200),
  unite: z.enum(['PIECE', 'KG']).default('PIECE'),
  tauxTvaBp: z.number().int().min(0).max(10_000),
  prixTtc: fcfa,
  dernierPrixAchat: fcfa.nullish(),
  seuilAlerte: z.number().int().nonnegative().default(0),
  categorieId: z.uuid().nullish(),
});

export const modificationArticleSchema = creationArticleSchema
  .omit({ codeBarres: true })
  .partial()
  .extend({
    actif: z.boolean().optional(),
    codeBarres: creationArticleSchema.shape.codeBarres.optional(),
  });

export const rechercheArticlesSchema = z.object({
  recherche: z.string().trim().max(100).optional(),
  categorieId: z.uuid().optional(),
  actif: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  parPage: z.coerce.number().int().min(1).max(200).default(50),
});

/**
 * Convertit un taux saisi en pourcentage (« 19,25 », « 19.25 », « 19,25 % », « 0 ») en points de base,
 * sans passer par un nombre à virgule flottante.
 */
export function tauxEnPointsDeBase(saisie: string | number): number | null {
  const s = String(saisie).replace('%', '').replace(',', '.').trim();
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const bp = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return bp <= 10_000 ? bp : null;
}

export function formaterTaux(bp: number): string {
  const entier = Math.floor(bp / 100);
  const reste = bp % 100;
  return reste === 0
    ? `${entier} %`
    : `${entier},${String(reste).padStart(2, '0').replace(/0$/, '')} %`;
}
