import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '../lib/api';
import { Choix } from '../ui';
import { useMoi } from './session';
import type { Magasin } from './types';

/**
 * Choix du magasin pour un directeur. Un gérant est limité au sien (le serveur l'impose aussi).
 * `tous` autorise « Tous les magasins » (valeur vide).
 */
export function SelecteurMagasin({
  valeur,
  onChange,
  tous = false,
}: {
  valeur: string;
  onChange: (id: string) => void;
  tous?: boolean;
}) {
  const moi = useMoi();
  const { data } = useQuery({ queryKey: ['magasins'], queryFn: () => api<Magasin[]>('/stores') });
  useEffect(() => {
    if (!valeur && !tous && data?.[0]) onChange(moi.magasin?.id ?? data[0].id);
  }, [valeur, tous, data, moi.magasin, onChange]);
  if (moi.role !== 'DIRECTEUR') return null;
  return (
    <Choix
      label="Magasin"
      value={valeur}
      onChange={(e) => onChange(e.target.value)}
      className="max-w-xs"
    >
      {tous && <option value="">Tous les magasins</option>}
      {data?.map((m) => (
        <option key={m.id} value={m.id}>
          {m.code} — {m.nom}
        </option>
      ))}
    </Choix>
  );
}
