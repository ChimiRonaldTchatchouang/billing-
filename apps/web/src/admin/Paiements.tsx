import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, formaterDate, formaterFcfa } from '../lib/api';
import { Badge, Bouton, Carte, Champ, Chargement, Choix, MessageErreur, Tableau } from '../ui';
import { SelecteurMagasin } from './SelecteurMagasin';
import { MODES } from './Ventes';

interface Paiement {
  id: string;
  mode: string;
  montant: number;
  numeroClient: string | null;
  reference: string | null;
  statut: 'A_RAPPROCHER' | 'RAPPROCHE' | 'ECART';
  note: string | null;
  ticket: string;
  le: string;
  caisse: string;
  caissier: string;
}

/** Rapprochement quotidien : chaque paiement saisi en caisse est comparé au relevé de l'opérateur. */
export function Paiements() {
  const qc = useQueryClient();
  const [storeId, setStoreId] = useState('');
  const [statut, setStatut] = useState<Paiement['statut']>('A_RAPPROCHER');
  const [choisis, setChoisis] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const { data, isLoading, error } = useQuery({
    queryKey: ['paiements', storeId, statut],
    queryFn: () =>
      api<Paiement[]>(
        `/payments?${new URLSearchParams({ statut, ...(storeId ? { storeId } : {}) })}`,
      ),
  });
  const rapprocher = useMutation({
    mutationFn: (s: 'RAPPROCHE' | 'ECART') =>
      api('/payments/reconcile', {
        body: { ids: [...choisis], statut: s, ...(note ? { note } : {}) },
      }),
    onSuccess: async () => {
      setChoisis(new Set());
      setNote('');
      await qc.invalidateQueries({ queryKey: ['paiements'] });
    },
  });
  const total = (data ?? []).filter((p) => choisis.has(p.id)).reduce((a, p) => a + p.montant, 0);
  const basculer = (id: string) => {
    const s = new Set(choisis);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setChoisis(s);
  };

  return (
    <Carte titre="Paiements Mobile Money">
      <p className="mb-3 text-sm text-gray-600">
        Comparez chaque paiement avec le relevé Orange Money ou MTN MoMo du compte marchand. Cochez
        ceux qui y figurent avec le bon montant et la bonne référence, puis « Rapprochés ». Signalez
        les autres en « Écart ».
      </p>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <SelecteurMagasin valeur={storeId} onChange={setStoreId} tous />
        <Choix
          label="Afficher"
          value={statut}
          onChange={(e) => (setStatut(e.target.value as Paiement['statut']), setChoisis(new Set()))}
          className="max-w-xs"
        >
          <option value="A_RAPPROCHER">À rapprocher</option>
          <option value="ECART">En écart</option>
          <option value="RAPPROCHE">Rapprochés</option>
        </Choix>
      </div>
      <MessageErreur erreur={error ?? rapprocher.error} />
      {isLoading ? (
        <Chargement />
      ) : (
        <Tableau
          entetes={[
            '',
            'Date',
            'Opérateur',
            'Référence',
            'N° client',
            'Montant',
            'Ticket',
            'Caissier',
            'Note',
          ]}
          vide={data?.length === 0}
        >
          {data?.map((p) => (
            <tr key={p.id} className={choisis.has(p.id) ? 'bg-green-50' : ''}>
              <td className="px-2 py-2">
                <input
                  type="checkbox"
                  aria-label={`Choisir ${p.reference ?? p.ticket}`}
                  checked={choisis.has(p.id)}
                  onChange={() => basculer(p.id)}
                />
              </td>
              <td className="px-2 py-2 whitespace-nowrap">{formaterDate(p.le)}</td>
              <td className="px-2 py-2">{MODES[p.mode] ?? p.mode}</td>
              <td className="px-2 py-2 font-mono text-xs">{p.reference}</td>
              <td className="px-2 py-2">{p.numeroClient}</td>
              <td className="px-2 py-2 whitespace-nowrap">{formaterFcfa(p.montant)}</td>
              <td className="px-2 py-2 font-mono text-xs">{p.ticket}</td>
              <td className="px-2 py-2">{p.caissier}</td>
              <td className="px-2 py-2">
                {p.statut === 'ECART' ? <Badge couleur="rouge">{p.note ?? 'Écart'}</Badge> : p.note}
              </td>
            </tr>
          ))}
        </Tableau>
      )}
      {choisis.size > 0 && (
        <div className="mt-4 flex flex-wrap items-end gap-3 rounded-md border bg-gray-50 p-3">
          <p className="pb-2 text-sm">
            {choisis.size} paiement(s) — {formaterFcfa(total)}
          </p>
          <Champ
            label="Note (facultative)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="min-w-64 flex-1"
          />
          <Bouton disabled={rapprocher.isPending} onClick={() => rapprocher.mutate('RAPPROCHE')}>
            Rapprochés
          </Bouton>
          <Bouton
            variante="danger"
            disabled={rapprocher.isPending}
            onClick={() => rapprocher.mutate('ECART')}
          >
            Écart
          </Bouton>
        </div>
      )}
    </Carte>
  );
}
