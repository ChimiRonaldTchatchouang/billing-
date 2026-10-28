import { z } from 'zod';
import { PIN_REGEX } from './pin.js';
import { roleSchema } from './schemas.js';

const email = z
  .email({ message: 'Adresse e-mail invalide.' })
  .transform((v) => v.trim().toLowerCase());
const motDePasse = z
  .string()
  .min(10, { message: 'Le mot de passe doit comporter au moins 10 caractères.' })
  .max(200);
const pin = z.string().regex(PIN_REGEX, { message: 'Le PIN doit comporter 4 chiffres.' });
const nom = z.string().trim().min(1, { message: 'Le nom est obligatoire.' }).max(120);

export const connexionSchema = z.object({ email, motDePasse: z.string().min(1).max(200) });
export const renouvellementSchema = z.object({ refreshToken: z.string().min(10).max(200) });
export const connexionPinSchema = z.object({ userId: z.uuid(), pin });
export const motDePasseOublieSchema = z.object({ email });
export const reinitialisationSchema = z.object({ jeton: z.string().min(10).max(200), motDePasse });

export const creationMagasinSchema = z.object({
  code: z.string().regex(/^M\d{2}$/, { message: 'Le code magasin a la forme M01.' }),
  nom,
  adresse: z.string().trim().max(300).optional(),
  telephone: z.string().trim().max(30).optional(),
});
export const modificationMagasinSchema = creationMagasinSchema
  .omit({ code: true })
  .partial()
  .extend({ actif: z.boolean().optional() });

export const creationCaisseSchema = z.object({
  storeId: z.uuid(),
  code: z.string().regex(/^C\d{2}$/, { message: 'Le code caisse a la forme C01.' }),
});
export const modificationCaisseSchema = z.object({ actif: z.boolean() });
export const activationCaisseSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z2-9]{8}$/, { message: 'Le code d’enregistrement comporte 8 caractères.' }),
});

export const creationUtilisateurSchema = z
  .object({
    nom,
    email: email.optional(),
    motDePasse: motDePasse.optional(),
    pin: pin.optional(),
    role: roleSchema,
    storeId: z.uuid().nullish(),
  })
  .superRefine((u, ctx) => {
    if (u.role === 'DIRECTEUR' && u.storeId) {
      ctx.addIssue({
        code: 'custom',
        path: ['storeId'],
        message: 'Un directeur n’est rattaché à aucun magasin.',
      });
    }
    if (u.role !== 'DIRECTEUR' && !u.storeId) {
      ctx.addIssue({
        code: 'custom',
        path: ['storeId'],
        message: 'Choisissez le magasin de rattachement.',
      });
    }
    if (u.role !== 'CAISSIER' && (!u.email || !u.motDePasse)) {
      ctx.addIssue({
        code: 'custom',
        path: ['email'],
        message: 'Un directeur ou un gérant a besoin d’un e-mail et d’un mot de passe.',
      });
    }
    if (u.role !== 'DIRECTEUR' && !u.pin) {
      ctx.addIssue({
        code: 'custom',
        path: ['pin'],
        message: 'Un PIN est obligatoire pour utiliser la caisse.',
      });
    }
  });

export const modificationUtilisateurSchema = z.object({
  nom: nom.optional(),
  email: email.nullish(),
  motDePasse: motDePasse.optional(),
  pin: pin.optional(),
  role: roleSchema.optional(),
  storeId: z.uuid().nullish(),
  actif: z.boolean().optional(),
});
