import { z } from 'zod';
import { PIN_REGEX } from './pin.js';

const fcfa = z.number().int().nonnegative();
const pin = z.string().regex(PIN_REGEX, { message: 'Le PIN doit comporter 4 chiffres.' });

export const receptionSchema = z.object({
  storeId: z.uuid(),
  fournisseur: z.string().trim().min(1, { message: 'Indiquez le fournisseur.' }).max(120),
  lignes: z
    .array(
      z.object({
        productId: z.uuid(),
        quantite: z.number().int().positive({ message: 'La quantité doit être positive.' }),
        prixAchat: fcfa,
      }),
    )
    .min(1, { message: 'Ajoutez au moins un article.' })
    .max(500),
});

export const ajustementSchema = z
  .object({
    storeId: z.uuid(),
    productId: z.uuid(),
    /** Variation signée (ex. -3 pour une casse). */
    quantite: z.number().int().optional(),
    /** Ou quantité comptée lors d'un inventaire : l'écart est calculé par le serveur. */
    quantiteReelle: z.number().int().nonnegative().optional(),
    motif: z
      .string()
      .trim()
      .min(3, { message: 'Indiquez le motif (casse, vol, inventaire…).' })
      .max(200),
  })
  .refine((a) => (a.quantite === undefined) !== (a.quantiteReelle === undefined), {
    message: 'Indiquez soit une variation, soit la quantité comptée.',
  })
  .refine((a) => a.quantite !== 0, { message: 'La variation ne peut pas être nulle.' });

export const retourSchema = z.object({
  sessionId: z.uuid(),
  gerantId: z.uuid(),
  pin,
  motif: z.string().trim().min(3).max(200),
  lignes: z
    .array(z.object({ ligneId: z.uuid(), quantite: z.number().int().positive() }))
    .min(1, { message: 'Choisissez au moins un article à reprendre.' }),
});

const comptage = z.object({
  ESPECES: fcfa,
  ORANGE_MONEY: fcfa.default(0),
  MTN_MOMO: fcfa.default(0),
});

export const clotureSchema = z.object({
  gerantId: z.uuid(),
  pin,
  compte: comptage,
});
