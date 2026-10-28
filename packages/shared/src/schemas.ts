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

export const ACTIONS_SENSIBLES = [
  'REMISE',
  'MODIFICATION_PRIX',
  'ANNULATION_LIGNE',
  'ANNULATION_TICKET',
] as const;
export type ActionSensible = (typeof ACTIONS_SENSIBLES)[number];

/** Validation d'une action sensible par le PIN d'un gérant, vérifié sur la caisse. */
export const approbationSchema = z.object({
  action: z.enum(ACTIONS_SENSIBLES),
  approuveePar: z.uuid(),
  le: z.iso.datetime({ offset: true }),
  details: z.string().max(300).optional(),
});
export type Approbation = z.infer<typeof approbationSchema>;

/** Vente envoyée par la caisse à POST /sync/sales. Pour les espèces, `montant` est la somme reçue. */
export const venteSyncSchema = z.object({
  id: z.uuid({ version: 'v7' }),
  numeroTicket: z.string().regex(/^M\d{2}-C\d{2}-\d{6,}$/),
  sessionId: z.uuid(),
  userId: z.uuid(),
  creeLe: z.iso.datetime({ offset: true }),
  remiseTicket: fcfa.default(0),
  lignes: z.array(ligneVenteSchema).min(1).max(500),
  paiements: z.array(paiementVenteSchema).min(1).max(10),
  approbations: z.array(approbationSchema).max(100).default([]),
});
export type VenteSync = z.input<typeof venteSyncSchema>;

/** Ouverture d'une session de caisse, faite sur le poste (éventuellement hors ligne). */
export const sessionSyncSchema = z.object({
  id: z.uuid(),
  ouvertePar: z.uuid(),
  ouverteLe: z.iso.datetime({ offset: true }),
  fondDeCaisse: fcfa,
});
export type SessionSync = z.infer<typeof sessionSyncSchema>;

/** Action sensible sans vente associée (ex. ticket annulé). */
export const evenementSyncSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  approbation: approbationSchema,
});
export type EvenementSync = z.infer<typeof evenementSyncSchema>;

export const lotVentesSchema = z
  .object({
    sessions: z.array(sessionSyncSchema).max(20).default([]),
    ventes: z.array(venteSyncSchema).max(200).default([]),
    evenements: z.array(evenementSyncSchema).max(200).default([]),
  })
  .refine((l) => l.sessions.length + l.ventes.length + l.evenements.length > 0, {
    message: 'Le lot est vide.',
  });

export type StatutReception = 'ENREGISTREE' | 'DEJA_RECUE' | 'REJETEE';

export interface ResultatSync {
  sessions: { id: string; statut: StatutReception; message?: string }[];
  ventes: { id: string; statut: StatutReception; message?: string }[];
  evenements: { id: string; statut: StatutReception }[];
}
