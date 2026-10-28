import { formaterTaux } from '@caisse/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, formaterFcfa } from '../lib/api';
import { Bouton, Carte, Champ, Chargement, MessageErreur, Tableau } from '../ui';
import { SelecteurMagasin } from './SelecteurMagasin';
import { MODES } from './Ventes';

interface Rapport {
  totaux: {
    tickets: number;
    ttc: number;
    ht: number;
    tva: number;
    remises: number;
    retours: number;
    net: number;
    tvaNette: number;
  };
  parJour: {
    jour: string;
    tickets: number;
    ttc: number;
    tva: number;
    remises: number;
    retours: number;
    net: number;
  }[];
  parMode: { mode: string; encaisse: number; rembourse: number; net: number }[];
  parTaux: { tauxBp: number; ht: number; tva: number; ttc: number }[];
}

const jour = (decalage = 0) => {
  const d = new Date(Date.now() + 3_600_000);
  d.setUTCDate(d.getUTCDate() + decalage);
  return d.toISOString().slice(0, 10);
};

export function Rapports() {
  const [storeId, setStoreId] = useState('');
  const [du, setDu] = useState(jour(-6));
  const [au, setAu] = useState(jour());
  const q = new URLSearchParams({ du, au, ...(storeId ? { storeId } : {}) });
  const { data, isLoading, error } = useQuery({
    queryKey: ['rapport', storeId, du, au],
    queryFn: () => api<Rapport>(`/reports/sales?${q}`),
  });
  const exporter = useMutation({
    mutationFn: async () => {
      const res = await api<Response>(`/reports/sales/export?${q}`, { brut: true });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(await res.blob());
      a.download = `ventes-${du}-${au}.csv`;
      a.click();
    },
  });
  return (
    <div className="space-y-4">
      <Carte
        titre="Rapport des ventes"
        actions={
          <Bouton
            variante="secondaire"
            disabled={exporter.isPending}
            onClick={() => exporter.mutate()}
          >
            Exporter (Excel / CSV)
          </Bouton>
        }
      >
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <SelecteurMagasin valeur={storeId} onChange={setStoreId} tous />
          <Champ label="Du" type="date" value={du} onChange={(e) => setDu(e.target.value)} />
          <Champ label="Au" type="date" value={au} onChange={(e) => setAu(e.target.value)} />
        </div>
        <MessageErreur erreur={error ?? exporter.error} />
        {isLoading || !data ? (
          <Chargement />
        ) : (
          <>
            <div className="mb-4 grid gap-3 sm:grid-cols-4">
              {[
                ['Ventes nettes TTC', formaterFcfa(data.totaux.net)],
                ['Tickets', String(data.totaux.tickets)],
                ['TVA collectée nette', formaterFcfa(data.totaux.tvaNette)],
                ['Remises accordées', formaterFcfa(data.totaux.remises)],
              ].map(([t, v]) => (
                <div key={t} className="rounded-md border p-3">
                  <p className="text-xs text-gray-600">{t}</p>
                  <p className="text-lg font-semibold">{v}</p>
                </div>
              ))}
            </div>
            <Tableau
              entetes={['Jour', 'Tickets', 'Ventes TTC', 'Retours', 'Net TTC', 'TVA', 'Remises']}
              vide={data.parJour.length === 0}
            >
              {data.parJour.map((j) => (
                <tr key={j.jour}>
                  <td className="px-2 py-2">
                    {new Date(`${j.jour}T12:00:00Z`).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-2 py-2">{j.tickets}</td>
                  <td className="px-2 py-2">{formaterFcfa(j.ttc)}</td>
                  <td className="px-2 py-2">{j.retours ? `-${formaterFcfa(j.retours)}` : '—'}</td>
                  <td className="px-2 py-2 font-medium">{formaterFcfa(j.net)}</td>
                  <td className="px-2 py-2">{formaterFcfa(j.tva)}</td>
                  <td className="px-2 py-2">{formaterFcfa(j.remises)}</td>
                </tr>
              ))}
            </Tableau>
          </>
        )}
      </Carte>
      {data && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Carte titre="Par mode de paiement">
            <Tableau
              entetes={['Mode', 'Encaissé', 'Remboursé', 'Net']}
              vide={data.parMode.length === 0}
            >
              {data.parMode.map((m) => (
                <tr key={m.mode}>
                  <td className="px-2 py-2">{MODES[m.mode] ?? m.mode}</td>
                  <td className="px-2 py-2">{formaterFcfa(m.encaisse)}</td>
                  <td className="px-2 py-2">
                    {m.rembourse ? `-${formaterFcfa(m.rembourse)}` : '—'}
                  </td>
                  <td className="px-2 py-2 font-medium">{formaterFcfa(m.net)}</td>
                </tr>
              ))}
            </Tableau>
          </Carte>
          <Carte titre="TVA par taux (retours déduits)">
            <Tableau entetes={['Taux', 'Base HT', 'TVA', 'TTC']} vide={data.parTaux.length === 0}>
              {data.parTaux.map((t) => (
                <tr key={t.tauxBp}>
                  <td className="px-2 py-2">{formaterTaux(t.tauxBp)}</td>
                  <td className="px-2 py-2">{formaterFcfa(t.ht)}</td>
                  <td className="px-2 py-2">{formaterFcfa(t.tva)}</td>
                  <td className="px-2 py-2">{formaterFcfa(t.ttc)}</td>
                </tr>
              ))}
            </Tableau>
          </Carte>
        </div>
      )}
    </div>
  );
}
