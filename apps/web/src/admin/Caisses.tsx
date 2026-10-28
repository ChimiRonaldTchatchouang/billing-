import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api, formaterDate } from '../lib/api';
import {
  Badge,
  Bouton,
  Carte,
  Champ,
  Chargement,
  Choix,
  MessageErreur,
  Modale,
  Tableau,
} from '../ui';
import { useMoi } from './session';
import type { CaisseAdmin, Magasin } from './types';

export function Caisses() {
  const moi = useMoi();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['caisses'],
    queryFn: () => api<CaisseAdmin[]>('/registers'),
  });
  const [nouvelle, setNouvelle] = useState(false);
  const [code, setCode] = useState<{ caisse: CaisseAdmin; code: string; expireLe: string } | null>(
    null,
  );

  const generer = useMutation({
    mutationFn: async (c: CaisseAdmin) => {
      const r = await api<{ code: string; expireLe: string }>(`/registers/${c.id}/enroll`, {
        method: 'POST',
      });
      return { caisse: c, ...r };
    },
    onSuccess: setCode,
  });
  const basculer = useMutation({
    mutationFn: (c: CaisseAdmin) =>
      api(`/registers/${c.id}`, { method: 'PATCH', body: { actif: !c.actif } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['caisses'] }),
  });

  return (
    <Carte
      titre="Caisses"
      actions={
        moi.role === 'DIRECTEUR' && (
          <Bouton onClick={() => setNouvelle(true)}>Ajouter une caisse</Bouton>
        )
      }
    >
      <p className="mb-3 text-sm text-gray-600">
        Pour enregistrer un poste : cliquez sur « Code d’enregistrement », puis saisissez ce code
        sur le poste, à l’adresse /caisse. Le code est valable 15 minutes et ne sert qu’une fois.
      </p>
      <MessageErreur erreur={error ?? generer.error ?? basculer.error} />
      {isLoading ? (
        <Chargement />
      ) : (
        <Tableau
          entetes={['Caisse', 'Magasin', 'Poste', 'Dernière synchronisation', '']}
          vide={data?.length === 0}
        >
          {data?.map((c) => (
            <tr key={c.id}>
              <td className="px-2 py-2 font-mono">
                {c.magasin.code}-{c.code}
              </td>
              <td className="px-2 py-2">{c.magasin.nom}</td>
              <td className="px-2 py-2">
                {!c.actif ? (
                  <Badge couleur="rouge">Désactivée</Badge>
                ) : c.enregistree ? (
                  <Badge couleur="vert">Enregistré</Badge>
                ) : (
                  <Badge>Non enregistré</Badge>
                )}
              </td>
              <td className="px-2 py-2">
                {c.derniereSynchronisation ? formaterDate(c.derniereSynchronisation) : '—'}
              </td>
              <td className="space-x-2 px-2 py-2 text-right whitespace-nowrap">
                {c.actif && (
                  <Bouton variante="discret" onClick={() => generer.mutate(c)}>
                    Code d’enregistrement
                  </Bouton>
                )}
                {moi.role === 'DIRECTEUR' && (
                  <Bouton variante="discret" onClick={() => basculer.mutate(c)}>
                    {c.actif ? 'Désactiver' : 'Réactiver'}
                  </Bouton>
                )}
              </td>
            </tr>
          ))}
        </Tableau>
      )}
      {code && (
        <Modale
          titre={`Enregistrer le poste ${code.caisse.magasin.code}-${code.caisse.code}`}
          onFermer={() => setCode(null)}
        >
          <p className="text-sm text-gray-600">Saisissez ce code sur le poste de caisse :</p>
          <p className="my-4 text-center font-mono text-4xl tracking-widest">{code.code}</p>
          <p className="text-sm text-gray-600">
            Valable jusqu’à {formaterDate(code.expireLe)}. Un ancien poste de cette caisse sera
            déconnecté.
          </p>
        </Modale>
      )}
      {nouvelle && <NouvelleCaisse onFermer={() => setNouvelle(false)} />}
    </Carte>
  );
}

function NouvelleCaisse({ onFermer }: { onFermer: () => void }) {
  const qc = useQueryClient();
  const magasins = useQuery({ queryKey: ['magasins'], queryFn: () => api<Magasin[]>('/stores') });
  const [storeId, setStoreId] = useState('');
  const [code, setCode] = useState('');
  const creer = useMutation({
    mutationFn: () => api('/registers', { body: { storeId, code } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['caisses'] });
      onFermer();
    },
  });
  const valider = (e: FormEvent) => {
    e.preventDefault();
    creer.mutate();
  };
  return (
    <Modale titre="Nouvelle caisse" onFermer={onFermer}>
      <form onSubmit={valider} className="space-y-3">
        <Choix
          label="Magasin"
          required
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
        >
          <option value="">Choisir…</option>
          {magasins.data?.map((m) => (
            <option key={m.id} value={m.id}>
              {m.code} — {m.nom}
            </option>
          ))}
        </Choix>
        <Champ
          label="Code (ex. C01)"
          required
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        <MessageErreur erreur={creer.error} />
        <div className="flex justify-end gap-2">
          <Bouton variante="secondaire" onClick={onFermer}>
            Annuler
          </Bouton>
          <Bouton type="submit" disabled={creer.isPending}>
            Créer
          </Bouton>
        </div>
      </form>
    </Modale>
  );
}
