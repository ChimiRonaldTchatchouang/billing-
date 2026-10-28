export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

/** Erreur de l'API au format standard { code, message, details }. */
export class ErreurApi extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: { champ?: string; ligne?: number; message?: string }[] = [],
  ) {
    super(message);
    this.name = 'ErreurApi';
  }
}

export const RESEAU_INDISPONIBLE = 'RESEAU_INDISPONIBLE';

export interface Session {
  accessToken: string;
  refreshToken: string;
  expireLe: number;
}

const CLE_SESSION = 'admin.session';
const CLE_APPAREIL = 'caisse.appareil';

function lire<T>(cle: string): T | null {
  try {
    const v = localStorage.getItem(cle);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

function ecrire(cle: string, v: unknown): void {
  try {
    if (v === null) localStorage.removeItem(cle);
    else localStorage.setItem(cle, JSON.stringify(v));
  } catch {
    // Stockage indisponible (navigation privée) : la session reste en mémoire seulement.
  }
}

let session: Session | null = lire<Session>(CLE_SESSION);
const ecouteurs = new Set<() => void>();

export const sessionActuelle = () => session;
export function definirSession(s: Session | null): void {
  session = s;
  ecrire(CLE_SESSION, s);
  ecouteurs.forEach((f) => f());
}
export function surChangementSession(f: () => void): () => void {
  ecouteurs.add(f);
  return () => ecouteurs.delete(f);
}

export const jetonAppareil = () => lire<string>(CLE_APPAREIL);
export const definirJetonAppareil = (j: string | null) => ecrire(CLE_APPAREIL, j);

type Auth = 'utilisateur' | 'caisse' | 'aucune';

interface Options {
  method?: string;
  body?: unknown;
  auth?: Auth;
  signal?: AbortSignal;
  /** Réponse brute (fichier) plutôt que JSON. */
  brut?: boolean;
}

let renouvellement: Promise<boolean> | null = null;

async function renouveler(): Promise<boolean> {
  const s = session;
  if (!s) return false;
  renouvellement ??= (async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: s.refreshToken }),
      });
      if (!res.ok) {
        definirSession(null);
        return false;
      }
      const j = (await res.json()) as {
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
      };
      definirSession({
        accessToken: j.accessToken,
        refreshToken: j.refreshToken,
        expireLe: Date.now() + j.expiresIn * 1000,
      });
      return true;
    } catch {
      return false;
    } finally {
      renouvellement = null;
    }
  })();
  return renouvellement;
}

export async function api<T>(chemin: string, o: Options = {}): Promise<T> {
  const auth = o.auth ?? 'utilisateur';
  const appel = async (): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (o.body !== undefined && !(o.body instanceof FormData))
      headers['Content-Type'] = 'application/json';
    if (auth === 'utilisateur' && session) headers.Authorization = `Bearer ${session.accessToken}`;
    if (auth === 'caisse') {
      const j = jetonAppareil();
      if (j) headers.Authorization = `Caisse ${j}`;
    }
    try {
      return await fetch(`${API_URL}/api/v1${chemin}`, {
        method: o.method ?? (o.body !== undefined ? 'POST' : 'GET'),
        headers,
        body:
          o.body === undefined
            ? undefined
            : o.body instanceof FormData
              ? o.body
              : JSON.stringify(o.body),
        signal: o.signal,
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      throw new ErreurApi(
        0,
        RESEAU_INDISPONIBLE,
        'Connexion au serveur impossible. Vérifiez le réseau.',
      );
    }
  };

  let res = await appel();
  if (res.status === 401 && auth === 'utilisateur' && session && (await renouveler())) {
    res = await appel();
  }
  if (!res.ok) {
    let corps: { code?: string; message?: string; details?: [] } = {};
    try {
      corps = await res.json();
    } catch {
      // Réponse non JSON
    }
    throw new ErreurApi(
      res.status,
      corps.code ?? 'ERREUR',
      corps.message ?? 'La demande n’a pas pu aboutir.',
      corps.details ?? [],
    );
  }
  if (o.brut) return res as unknown as T;
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function verifierApi(signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`, { signal });
    return res.ok;
  } catch {
    return false;
  }
}

export const formaterFcfa = (n: number) =>
  `${new Intl.NumberFormat('fr-FR').format(n).replace(/[\u202f\u00a0]/g, ' ')} FCFA`;

export const formaterDate = (d: string | number | Date) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(d));
