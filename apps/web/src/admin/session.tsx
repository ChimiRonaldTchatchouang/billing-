import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext, useEffect, useSyncExternalStore } from 'react';
import { api, definirSession, sessionActuelle, surChangementSession } from '../lib/api';
import type { Moi } from './types';

export function useSessionActive(): boolean {
  return useSyncExternalStore(surChangementSession, () => sessionActuelle() !== null);
}

const MoiContexte = createContext<Moi | null>(null);

export function useMoi(): Moi {
  const moi = useContext(MoiContexte);
  if (!moi) throw new Error('useMoi hors de FournisseurMoi');
  return moi;
}

export function FournisseurMoi({ children, attente }: { children: ReactNode; attente: ReactNode }) {
  const { data } = useQuery({ queryKey: ['moi'], queryFn: () => api<Moi>('/auth/me') });
  return data ? <MoiContexte.Provider value={data}>{children}</MoiContexte.Provider> : attente;
}

export async function seConnecter(email: string, motDePasse: string): Promise<void> {
  const j = await api<{ accessToken: string; refreshToken: string; expiresIn: number }>(
    '/auth/login',
    {
      body: { email, motDePasse },
      auth: 'aucune',
    },
  );
  definirSession({
    accessToken: j.accessToken,
    refreshToken: j.refreshToken,
    expireLe: Date.now() + j.expiresIn * 1000,
  });
}

export function useDeconnexion() {
  const qc = useQueryClient();
  return async () => {
    const s = sessionActuelle();
    if (s)
      await api('/auth/logout', { body: { refreshToken: s.refreshToken }, auth: 'aucune' }).catch(
        () => undefined,
      );
    definirSession(null);
    qc.clear();
  };
}

/** Vide le cache quand la session disparaît (expiration). */
export function useNettoyageSession() {
  const qc = useQueryClient();
  const active = useSessionActive();
  useEffect(() => {
    if (!active) qc.clear();
  }, [active, qc]);
}
