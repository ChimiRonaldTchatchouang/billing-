import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, formaterDate, formaterFcfa } from '../lib/api';
import { Badge, Carte, Chargement, MessageErreur, Tableau as Table } from '../ui';
import { SelecteurMagasin } from './SelecteurMagasin';

interface Tableau {
  jour: string;
  ventes: {
    tickets: number;
    chiffreAffairesTtc: number;
    retours: number;
    net: number;
    panierMoyen: number;
    parMagasin: { code: string; nom: string; tickets: number; ttc: number; retours: number }[];
  };
  septJours: { jour: string; net: number }[];
  meilleursArticles: { nom: string; quantite: number; unite: string; ttc: number }[];
  alertes: {
    stockBas: number;
    stockNegatif: number;
    mobileMoneyARapprocher: { nombre: number; montant: number };
    ecartsPrixDuJour: number;
    caissesOuvertes: {
      caisse: string;
      derniereSynchronisation: string | null;
      silencieuse: boolean;
    }[];
  };
}

const jourCourt = (j: string) =>
  new Date(`${j}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });

function Chiffre({ titre, valeur, detail }: { titre: string; valeur: string; detail?: string }) {
  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <p className="text-sm text-gray-600">{titre}</p>
      <p className="mt-1 text-2xl font-semibold">{valeur}</p>
      {detail && <p className="text-xs text-gray-500">{detail}</p>}
    </div>
  );
}

export function TableauDeBord() {
  const [storeId, setStoreId] = useState('');
  const { data, isLoading, error } = useQuery({
    queryKey: ['tableau', storeId],
    queryFn: () => api<Tableau>(`/reports/dashboard${storeId ? `?storeId=${storeId}` : ''}`),
    refetchInterval: 60_000,
  });
  if (isLoading) return <Chargement />;
  if (!data) return <MessageErreur erreur={error} />;
  const a = data.alertes;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-xl font-semibold">Aujourd’hui</h1>
        <SelecteurMagasin valeur={storeId} onChange={setStoreId} tous />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Chiffre
          titre="Ventes nettes"
          valeur={formaterFcfa(data.ventes.net)}
          detail={
            data.ventes.retours ? `dont retours -${formaterFcfa(data.ventes.retours)}` : undefined
          }
        />
        <Chiffre titre="Tickets" valeur={String(data.ventes.tickets)} />
        <Chiffre titre="Panier moyen" valeur={formaterFcfa(data.ventes.panierMoyen)} />
        <Chiffre
          titre="Mobile Money à rapprocher"
          valeur={String(a.mobileMoneyARapprocher.nombre)}
          detail={formaterFcfa(a.mobileMoneyARapprocher.montant)}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Carte titre="7 derniers jours (ventes nettes)">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.septJours.map((j) => ({ ...j, libelle: jourCourt(j.jour) }))}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="libelle" fontSize={12} />
                  <YAxis
                    fontSize={12}
                    tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
                    width={40}
                  />
                  <Tooltip formatter={(v: number) => formaterFcfa(v)} />
                  <Bar dataKey="net" name="Ventes nettes" fill="#15803d" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Carte>
        </div>
        <Carte titre="À surveiller">
          <ul className="space-y-2 text-sm">
            <li>
              <Link to="/admin/stock" className="hover:underline">
                Articles à commander : <b>{a.stockBas}</b>
              </Link>
            </li>
            <li>
              <Link to="/admin/stock" className="hover:underline">
                Stocks négatifs :{' '}
                <b className={a.stockNegatif ? 'text-red-700' : ''}>{a.stockNegatif}</b>
              </Link>
            </li>
            <li>
              <Link to="/admin/ventes" className="hover:underline">
                Écarts de prix aujourd’hui :{' '}
                <b className={a.ecartsPrixDuJour ? 'text-orange-700' : ''}>{a.ecartsPrixDuJour}</b>
              </Link>
            </li>
            <li>
              <Link to="/admin/paiements" className="hover:underline">
                Mobile Money à rapprocher : <b>{a.mobileMoneyARapprocher.nombre}</b>
              </Link>
            </li>
            <li className="pt-2 font-medium">Caisses ouvertes</li>
            {a.caissesOuvertes.length === 0 && <li className="text-gray-500">Aucune</li>}
            {a.caissesOuvertes.map((c) => (
              <li key={c.caisse} className="flex justify-between gap-2">
                <span className="font-mono">{c.caisse}</span>
                {c.silencieuse ? (
                  <Badge couleur="rouge">
                    Sans nouvelles{' '}
                    {c.derniereSynchronisation
                      ? `depuis ${formaterDate(c.derniereSynchronisation)}`
                      : ''}
                  </Badge>
                ) : (
                  <Badge couleur="vert">Synchronisée</Badge>
                )}
              </li>
            ))}
          </ul>
        </Carte>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Carte titre="Par magasin">
          <Table
            entetes={['Magasin', 'Tickets', 'Ventes TTC', 'Retours']}
            vide={data.ventes.parMagasin.length === 0}
          >
            {data.ventes.parMagasin.map((m) => (
              <tr key={m.code}>
                <td className="px-2 py-2">
                  {m.code} — {m.nom}
                </td>
                <td className="px-2 py-2">{m.tickets}</td>
                <td className="px-2 py-2">{formaterFcfa(m.ttc)}</td>
                <td className="px-2 py-2">{m.retours ? `-${formaterFcfa(m.retours)}` : '—'}</td>
              </tr>
            ))}
          </Table>
        </Carte>
        <Carte titre="Meilleures ventes du jour">
          <Table
            entetes={['Article', 'Quantité', 'Ventes TTC']}
            vide={data.meilleursArticles.length === 0}
          >
            {data.meilleursArticles.map((t) => (
              <tr key={t.nom}>
                <td className="px-2 py-2">{t.nom}</td>
                <td className="px-2 py-2">
                  {t.unite === 'KG'
                    ? `${(t.quantite / 1000).toLocaleString('fr-FR')} kg`
                    : t.quantite}
                </td>
                <td className="px-2 py-2">{formaterFcfa(t.ttc)}</td>
              </tr>
            ))}
          </Table>
        </Carte>
      </div>
    </div>
  );
}
