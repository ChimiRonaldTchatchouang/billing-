import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { RapportCloture } from '../caisse/Cloture';
import { api, formaterDate, formaterFcfa } from '../lib/api';
import { Badge, Bouton, Carte, Chargement, MessageErreur, Modale, Tableau } from '../ui';
import { SelecteurMagasin } from './SelecteurMagasin';

interface Session {
  id: string;
  caisse: string;
  statut: 'OUVERTE' | 'FERMEE';
  ouverteLe: string;
  ouvertePar: string;
  fermeeLe: string | null;
  fermeePar: string | null;
  ecartEspeces: number | null;
}

export function Sessions() {
  const [storeId, setStoreId] = useState('');
  const [rapport, setRapport] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ['sessions', storeId],
    queryFn: () => api<Session[]>(`/cash-sessions${storeId ? `?storeId=${storeId}` : ''}`),
  });
  return (
    <Carte titre="Sessions de caisse">
      <div className="mb-3">
        <SelecteurMagasin valeur={storeId} onChange={setStoreId} tous />
      </div>
      <MessageErreur erreur={error} />
      {isLoading ? (
        <Chargement />
      ) : (
        <Tableau
          entetes={['Caisse', 'Ouverte', 'Clôturée', 'État', 'Écart espèces', '']}
          vide={data?.length === 0}
        >
          {data?.map((s) => (
            <tr key={s.id}>
              <td className="px-2 py-2 font-mono">{s.caisse}</td>
              <td className="px-2 py-2">
                {formaterDate(s.ouverteLe)} — {s.ouvertePar}
              </td>
              <td className="px-2 py-2">
                {s.fermeeLe ? `${formaterDate(s.fermeeLe)} — ${s.fermeePar}` : '—'}
              </td>
              <td className="px-2 py-2">
                {s.statut === 'OUVERTE' ? (
                  <Badge couleur="orange">Ouverte</Badge>
                ) : (
                  <Badge couleur="vert">Clôturée</Badge>
                )}
              </td>
              <td className={`px-2 py-2 ${s.ecartEspeces ? 'font-semibold text-red-700' : ''}`}>
                {s.ecartEspeces === null ? '—' : formaterFcfa(s.ecartEspeces)}
              </td>
              <td className="px-2 py-2 text-right">
                <Bouton variante="discret" onClick={() => setRapport(s.id)}>
                  Rapport
                </Bouton>
              </td>
            </tr>
          ))}
        </Tableau>
      )}
      {rapport && <RapportModale id={rapport} onFermer={() => setRapport(null)} />}
    </Carte>
  );
}

function RapportModale({ id, onFermer }: { id: string; onFermer: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['rapport-session', id],
    queryFn: () =>
      api<Parameters<typeof RapportCloture>[0]['rapport']>(`/cash-sessions/${id}/report`),
  });
  return (
    <Modale titre="Rapport de caisse" onFermer={onFermer}>
      {isLoading || !data ? <Chargement /> : <RapportCloture rapport={data} />}
    </Modale>
  );
}
