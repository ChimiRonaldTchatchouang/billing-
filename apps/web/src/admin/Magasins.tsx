import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api } from '../lib/api';
import { Badge, Bouton, Carte, Champ, Chargement, MessageErreur, Modale, Tableau } from '../ui';
import type { Magasin } from './types';

export function Magasins() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['magasins'],
    queryFn: () => api<Magasin[]>('/stores'),
  });
  const [edition, setEdition] = useState<Magasin | 'nouveau' | null>(null);

  const basculer = useMutation({
    mutationFn: (m: Magasin) =>
      api(`/stores/${m.id}`, { method: 'PATCH', body: { actif: !m.actif } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['magasins'] }),
  });

  return (
    <Carte
      titre="Magasins"
      actions={<Bouton onClick={() => setEdition('nouveau')}>Ajouter un magasin</Bouton>}
    >
      <MessageErreur erreur={error ?? basculer.error} />
      {isLoading ? (
        <Chargement />
      ) : (
        <Tableau
          entetes={['Code', 'Nom', 'Adresse', 'Téléphone', 'État', '']}
          vide={data?.length === 0}
        >
          {data?.map((m) => (
            <tr key={m.id}>
              <td className="px-2 py-2 font-mono">{m.code}</td>
              <td className="px-2 py-2">{m.nom}</td>
              <td className="px-2 py-2">{m.adresse}</td>
              <td className="px-2 py-2">{m.telephone}</td>
              <td className="px-2 py-2">
                {m.actif ? <Badge couleur="vert">Actif</Badge> : <Badge>Fermé</Badge>}
              </td>
              <td className="space-x-2 px-2 py-2 text-right whitespace-nowrap">
                <Bouton variante="discret" onClick={() => setEdition(m)}>
                  Modifier
                </Bouton>
                <Bouton variante="discret" onClick={() => basculer.mutate(m)}>
                  {m.actif ? 'Fermer' : 'Rouvrir'}
                </Bouton>
              </td>
            </tr>
          ))}
        </Tableau>
      )}
      {edition && (
        <FormulaireMagasin
          magasin={edition === 'nouveau' ? null : edition}
          onFermer={() => setEdition(null)}
        />
      )}
    </Carte>
  );
}

function FormulaireMagasin({
  magasin,
  onFermer,
}: {
  magasin: Magasin | null;
  onFermer: () => void;
}) {
  const qc = useQueryClient();
  const [code, setCode] = useState(magasin?.code ?? '');
  const [nom, setNom] = useState(magasin?.nom ?? '');
  const [adresse, setAdresse] = useState(magasin?.adresse ?? '');
  const [telephone, setTelephone] = useState(magasin?.telephone ?? '');
  const enregistrer = useMutation({
    mutationFn: () =>
      magasin
        ? api(`/stores/${magasin.id}`, { method: 'PATCH', body: { nom, adresse, telephone } })
        : api('/stores', {
            body: { code, nom, adresse: adresse || undefined, telephone: telephone || undefined },
          }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['magasins'] });
      onFermer();
    },
  });
  const valider = (e: FormEvent) => {
    e.preventDefault();
    enregistrer.mutate();
  };
  return (
    <Modale titre={magasin ? `Modifier ${magasin.code}` : 'Nouveau magasin'} onFermer={onFermer}>
      <form onSubmit={valider} className="space-y-3">
        {!magasin && (
          <Champ
            label="Code (ex. M01)"
            required
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        )}
        <Champ label="Nom" required value={nom} onChange={(e) => setNom(e.target.value)} />
        <Champ label="Adresse" value={adresse} onChange={(e) => setAdresse(e.target.value)} />
        <Champ label="Téléphone" value={telephone} onChange={(e) => setTelephone(e.target.value)} />
        <MessageErreur erreur={enregistrer.error} />
        <div className="flex justify-end gap-2">
          <Bouton variante="secondaire" onClick={onFermer}>
            Annuler
          </Bouton>
          <Bouton type="submit" disabled={enregistrer.isPending}>
            Enregistrer
          </Bouton>
        </div>
      </form>
    </Modale>
  );
}
