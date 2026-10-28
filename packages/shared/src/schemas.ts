import { z } from 'zod';

export const ROLES = ['DIRECTEUR', 'GERANT', 'CAISSIER'] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

const fcfa = z.number().int().nonnegative();

export const ligneVenteSchema = z.object({
  productId: z.uuid(),
  libelle: z.string().min(1).max(200),
  prixUnitaireTtc: fcfa,
  quantite: z.number().int().positive(),
  unite: z.enum(['PIECE', 'KG']),
  tauxTvaBp: z.number().int().min(0).max(10_000),
  remise: fcfa.default(0),
});

export const paiementVenteSchema = z.object({
  mode: z.enum(['ESPECES', 'ORANGE_MONEY', 'MTN_MOMO']),
  montant: fcfa,
  numeroClient: z.string().max(20).optional(),
  reference: z.string().max(100).optional(),
});

/** Vente envoyée par la caisse à POST /sync/sales. */
export const venteSyncSchema = z.object({
  id: z.uuid({ version: 'v7' }),
  numeroTicket: z.string().regex(/^M\d{2}-C\d{2}-\d{6,}$/),
  sessionId: z.uuid(),
  creeLe: z.iso.datetime({ offset: true }),
  remiseTicket: fcfa.default(0),
  lignes: z.array(ligneVenteSchema).min(1),
  paiements: z.array(paiementVenteSchema).min(1),
});
export type VenteSync = z.infer<typeof venteSyncSchema>;

export const lotVentesSchema = z.object({
  ventes: z.array(venteSyncSchema).min(1).max(200),
});
