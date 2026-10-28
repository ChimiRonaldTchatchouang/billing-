import Dexie, { type EntityTable } from 'dexie';
import type { EvenementSync, VenteSync } from '@caisse/shared';

export interface InfosPoste {
  caisse: { id: string; code: string };
  magasin: {
    id: string;
    code: string;
    nom: string;
    adresse: string | null;
    telephone: string | null;
  };
  organisation: {
    nom: string;
    niu: string | null;
    rccm: string | null;
    adresse: string | null;
    telephone: string | null;
  };
}

export interface Employe {
  id: string;
  nom: string;
  role: 'DIRECTEUR' | 'GERANT' | 'CAISSIER';
  empreintePin: string;
}

export interface ProduitLocal {
  id: string;
  codeBarres: string;
  nom: string;
  unite: 'PIECE' | 'KG';
  tauxTvaBp: number;
  prixTtc: number;
  actif: boolean;
  categorie: string | null;
  majLe: string;
}

export type StatutEnvoi = 'EN_ATTENTE' | 'ENVOYEE' | 'REJETEE';

/** Vente enregistrée sur la caisse : la file d'envoi et l'historique de réimpression. */
export interface VenteLocale {
  id: string;
  numeroTicket: string;
  creeLe: string;
  statut: StatutEnvoi;
  erreur?: string;
  envoyeeLe?: string;
  vente: VenteSync;
  /** Montants calculés au moment de la vente, pour le ticket. */
  ticket: TicketImprime;
}

export interface TicketImprime {
  caissier: string;
  lignes: {
    libelle: string;
    quantite: number;
    unite: 'PIECE' | 'KG';
    prixUnitaireTtc: number;
    net: number;
    remise: number;
  }[];
  brut: number;
  remise: number;
  ht: number;
  tva: number;
  ttc: number;
  parTaux: { tauxBp: number; ht: number; tva: number; ttc: number }[];
  paiements: { mode: string; montant: number }[];
  rendu: number;
}

export interface SessionLocale {
  id: string;
  ouverteLe: string;
  ouvertePar: string;
  fondDeCaisse: number;
  statut: 'OUVERTE' | 'FERMEE';
  /** 1 quand le serveur a confirmé la réception de l'ouverture. */
  envoyee: 0 | 1;
}

/** Action sensible sans vente (ex. ticket annulé), envoyée au journal d'audit. */
export interface EvenementLocal {
  id: string;
  envoye: 0 | 1;
  evenement: EvenementSync;
}

interface Meta {
  cle: string;
  valeur: unknown;
}

export const db = new Dexie('caisse') as Dexie & {
  meta: EntityTable<Meta, 'cle'>;
  produits: EntityTable<ProduitLocal, 'id'>;
  personnel: EntityTable<Employe, 'id'>;
  ventes: EntityTable<VenteLocale, 'id'>;
  sessions: EntityTable<SessionLocale, 'id'>;
  evenements: EntityTable<EvenementLocal, 'id'>;
};

db.version(1).stores({
  meta: 'cle',
  produits: 'id, &codeBarres, nom, majLe',
  personnel: 'id',
  ventes: 'id, statut, creeLe',
  sessions: 'id, statut, envoyee',
  evenements: 'id, envoye',
});

export async function lireMeta<T>(cle: string): Promise<T | undefined> {
  return (await db.meta.get(cle))?.valeur as T | undefined;
}

export async function ecrireMeta(cle: string, valeur: unknown): Promise<void> {
  await db.meta.put({ cle, valeur });
}

/** Réserve le prochain numéro de séquence de ticket, sans trou ni doublon sur ce poste. */
export async function prochainNumero(): Promise<number> {
  return db.transaction('rw', db.meta, async () => {
    const n = ((await lireMeta<number>('dernierNumero')) ?? 0) + 1;
    await ecrireMeta('dernierNumero', n);
    return n;
  });
}

export async function effacerPoste(): Promise<void> {
  await Promise.all([db.meta.clear(), db.produits.clear(), db.personnel.clear()]);
}
