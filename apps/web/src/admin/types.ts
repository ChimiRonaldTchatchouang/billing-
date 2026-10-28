export type Role = 'DIRECTEUR' | 'GERANT' | 'CAISSIER';

export const ROLES_LIBELLES: Record<Role, string> = {
  DIRECTEUR: 'Directeur',
  GERANT: 'Gérant',
  CAISSIER: 'Caissier',
};

export interface Moi {
  id: string;
  nom: string;
  email: string | null;
  role: Role;
  magasin: { id: string; code: string; nom: string } | null;
  organisation: { id: string; nom: string };
}

export interface Magasin {
  id: string;
  code: string;
  nom: string;
  adresse: string | null;
  telephone: string | null;
  actif: boolean;
}

export interface CaisseAdmin {
  id: string;
  code: string;
  magasin: { id: string; code: string; nom: string };
  enregistree: boolean;
  enregistreeLe: string | null;
  derniereSynchronisation: string | null;
  actif: boolean;
}

export interface Utilisateur {
  id: string;
  nom: string;
  email: string | null;
  role: Role;
  storeId: string | null;
  magasin: { code: string; nom: string } | null;
  actif: boolean;
  aUnPin: boolean;
  bloqueJusqua: string | null;
}
