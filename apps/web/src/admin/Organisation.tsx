import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Bouton, Carte, Champ, Chargement, MessageErreur } from '../ui';

interface Org {
  nom: string;
  niu: string | null;
  rccm: string | null;
  adresse: string | null;
  telephone: string | null;
}

/** Mentions légales de l'entreprise, imprimées sur les tickets et les factures. */
export function Organisation() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['organisation'],
    queryFn: () => api<Org>('/organization'),
  });
  const [f, setF] = useState<Org>({ nom: '', niu: '', rccm: '', adresse: '', telephone: '' });
  useEffect(() => {
    if (data)
      setF({
        ...data,
        niu: data.niu ?? '',
        rccm: data.rccm ?? '',
        adresse: data.adresse ?? '',
        telephone: data.telephone ?? '',
      });
  }, [data]);
  const enregistrer = useMutation({
    mutationFn: () =>
      api('/organization', {
        method: 'PATCH',
        body: {
          nom: f.nom,
          niu: f.niu || null,
          rccm: f.rccm || null,
          adresse: f.adresse || null,
          telephone: f.telephone || null,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['organisation'] }),
  });
  if (isLoading) return <Chargement />;
  const champ = (k: keyof Org, label: string) => (
    <Champ label={label} value={f[k] ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
  );
  return (
    <Carte titre="Entreprise">
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          enregistrer.mutate();
        }}
        className="max-w-lg space-y-3"
      >
        <p className="text-sm text-gray-600">
          Ces informations figurent sur les tickets et les factures. Les caisses les reçoivent lors
          de leur enregistrement.
        </p>
        {champ('nom', 'Raison sociale')}
        {champ('niu', 'NIU')}
        {champ('rccm', 'RCCM')}
        {champ('adresse', 'Adresse du siège')}
        {champ('telephone', 'Téléphone')}
        <MessageErreur erreur={enregistrer.error} />
        {enregistrer.isSuccess && <p className="text-sm text-green-800">Enregistré.</p>}
        <Bouton type="submit" disabled={enregistrer.isPending}>
          Enregistrer
        </Bouton>
      </form>
    </Carte>
  );
}
