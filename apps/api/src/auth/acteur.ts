import type { Role } from '@prisma/client';
import { interdit } from '../common/errors.js';

/** Qui appelle l'API : un utilisateur connecté (jeton) ou une caisse enregistrée (jeton d'appareil). */
export interface Acteur {
  type: 'UTILISATEUR' | 'CAISSE';
  organizationId: string;
  userId: string | null;
  role: Role | null;
  /** Magasin de rattachement ; null pour un directeur (tous les magasins). */
  storeId: string | null;
  registerId: string | null;
}

export type Autorisation = Role | 'CAISSE';

export const TOUS: Autorisation[] = ['DIRECTEUR', 'GERANT', 'CAISSIER'];
export const GERANT_PLUS: Autorisation[] = ['DIRECTEUR', 'GERANT'];

/**
 * Magasin sur lequel porte une requête. Un directeur peut viser n'importe quel magasin de son
 * organisation (ou tous si rien n'est demandé) ; les autres sont limités au leur, quoi que demande
 * le navigateur.
 */
export function magasinAutorise(acteur: Acteur, demande?: string | null): string | undefined {
  if (acteur.type === 'UTILISATEUR' && acteur.role === 'DIRECTEUR') return demande ?? undefined;
  if (!acteur.storeId) throw interdit();
  if (demande && demande !== acteur.storeId) {
    throw interdit('Vous n’avez accès qu’aux données de votre magasin.');
  }
  return acteur.storeId;
}

export function exigerMagasin(acteur: Acteur, storeId: string): void {
  magasinAutorise(acteur, storeId);
}
