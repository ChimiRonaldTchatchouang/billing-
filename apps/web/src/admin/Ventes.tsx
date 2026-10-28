import { formaterTaux } from '@caisse/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, formaterDate, formaterFcfa } from '../lib/api';
import { Badge, Bouton, Carte, Champ, Chargement, MessageErreur, Modale, Tableau } from '../ui';
import { SelecteurMagasin } from './SelecteurMagasin';

export const MODES: Record<string, string> = {
  ESPECES: 'Espèces',
  ORANGE_MONEY: 'Orange Money',
  MTN_MOMO: 'MTN MoMo',
};

interface LigneListe {
  id: string;
  numeroTicket: string;
  creeLe: string;
  magasin: string;
  caisse: string;
  caissier: string;
  totalTtc: number;
  remise: number;
  statut: 'VALIDEE' | 'RETOUR' | 'ANNULEE';
  modes: string[];
  facture: string | null;
}

export interface DetailVente {
  id: string;
  numeroTicket: string;
  creeLe: string;
  recueLe: string;
  statut: string;
  magasin: { code: string; nom: string };
  caisse: string;
  caissier: string;
  totalHt: number;
  totalTva: number;
  totalTtc: number;
  remise: number;
  rendu: number;
  venteOrigine: { id: string; numeroTicket: string } | null;
  retours: { id: string; numeroTicket: string; totalTtc: number; creeLe: string }[];
  lignes: {
    id: string;
    libelle: string;
    prixUnitaireTtc: number;
    quantite: number;
    unite: 'PIECE' | 'KG';
    remise: number;
    tauxTvaBp: number;
    totalTtc: number;
    prixCatalogue: number | null;
    quantiteRendue: number;
  }[];
  paiements: {
    id: string;
    mode: string;
    montant: number;
    numeroClient: string | null;
    reference: string | null;
    statut: string;
  }[];
  facture: { id: string; numero: string; client: string; envoyeeLe: string | null } | null;
}

const aujourdhui = () => new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
const qte = (q: number, u: 'PIECE' | 'KG') =>
  u === 'KG' ? `${(q / 1000).toLocaleString('fr-FR')} kg` : String(q);

export function Ventes({
  actionsDetail,
}: {
  actionsDetail?: (v: DetailVente, recharger: () => void) => React.ReactNode;
}) {
  const [storeId, setStoreId] = useState('');
  const [du, setDu] = useState(aujourdhui());
  const [au, setAu] = useState(aujourdhui());
  const [recherche, setRecherche] = useState('');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<string | null>(null);
  const q = new URLSearchParams({
    page: String(page),
    du,
    au,
    ...(storeId ? { storeId } : {}),
    ...(recherche ? { recherche } : {}),
  });
  const { data, isLoading, error } = useQuery({
    queryKey: ['ventes', storeId, du, au, recherche, page],
    queryFn: () => api<{ total: number; parPage: number; ventes: LigneListe[] }>(`/sales?${q}`),
    placeholderData: keepPreviousData,
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.parPage)) : 1;
  return (
    <Carte titre="Ventes">
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <SelecteurMagasin valeur={storeId} onChange={setStoreId} tous />
        <Champ
          label="Du"
          type="date"
          value={du}
          onChange={(e) => (setDu(e.target.value), setPage(1))}
        />
        <Champ
          label="Au"
          type="date"
          value={au}
          onChange={(e) => (setAu(e.target.value), setPage(1))}
        />
        <Champ
          label="N° de ticket"
          value={recherche}
          onChange={(e) => (setRecherche(e.target.value), setPage(1))}
        />
      </div>
      <MessageErreur erreur={error} />
      {isLoading ? (
        <Chargement />
      ) : (
        <>
          <Tableau
            entetes={['Ticket', 'Date', 'Caisse', 'Caissier', 'Paiement', 'Total TTC', '']}
            vide={data?.ventes.length === 0}
          >
            {data?.ventes.map((v) => (
              <tr key={v.id}>
                <td className="px-2 py-2 font-mono text-xs">
                  {v.numeroTicket} {v.statut === 'RETOUR' && <Badge couleur="orange">Retour</Badge>}
                  {v.facture && <Badge couleur="vert">Facture {v.facture}</Badge>}
                </td>
                <td className="px-2 py-2 whitespace-nowrap">{formaterDate(v.creeLe)}</td>
                <td className="px-2 py-2">
                  {v.magasin}-{v.caisse}
                </td>
                <td className="px-2 py-2">{v.caissier}</td>
                <td className="px-2 py-2">{v.modes.map((m) => MODES[m] ?? m).join(' + ')}</td>
                <td
                  className={`px-2 py-2 whitespace-nowrap ${v.statut === 'RETOUR' ? 'text-red-700' : ''}`}
                >
                  {v.statut === 'RETOUR' ? '-' : ''}
                  {formaterFcfa(v.totalTtc)}
                </td>
                <td className="px-2 py-2 text-right">
                  <Bouton variante="discret" onClick={() => setDetail(v.id)}>
                    Détail
                  </Bouton>
                </td>
              </tr>
            ))}
          </Tableau>
          <div className="mt-3 flex items-center justify-between text-sm">
            <span>{data?.total ?? 0} ticket(s)</span>
            <div className="flex items-center gap-2">
              <Bouton variante="secondaire" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Précédent
              </Bouton>
              <span>
                Page {page} / {pages}
              </span>
              <Bouton
                variante="secondaire"
                disabled={page >= pages}
                onClick={() => setPage(page + 1)}
              >
                Suivant
              </Bouton>
            </div>
          </div>
        </>
      )}
      {detail && (
        <DetailModale id={detail} onFermer={() => setDetail(null)} actions={actionsDetail} />
      )}
    </Carte>
  );
}

function DetailModale({
  id,
  onFermer,
  actions,
}: {
  id: string;
  onFermer: () => void;
  actions?: (v: DetailVente, recharger: () => void) => React.ReactNode;
}) {
  const {
    data: v,
    isLoading,
    error,
    refetch,
  } = useQuery({ queryKey: ['vente', id], queryFn: () => api<DetailVente>(`/sales/${id}`) });
  return (
    <Modale titre={v ? `Ticket ${v.numeroTicket}` : 'Ticket'} onFermer={onFermer}>
      <MessageErreur erreur={error} />
      {isLoading || !v ? (
        <Chargement />
      ) : (
        <div className="space-y-3 text-sm">
          <p className="text-gray-600">
            {formaterDate(v.creeLe)} — caisse {v.magasin.code}-{v.caisse} — {v.caissier}
            {v.venteOrigine && ` — retour du ticket ${v.venteOrigine.numeroTicket}`}
          </p>
          <table className="w-full">
            <tbody className="divide-y">
              {v.lignes.map((l) => (
                <tr key={l.id}>
                  <td className="py-1">
                    {l.libelle}
                    {l.prixCatalogue !== null && (
                      <span className="ml-1">
                        <Badge couleur="orange">
                          Prix catalogue {formaterFcfa(l.prixCatalogue)}
                        </Badge>
                      </span>
                    )}
                    {l.quantiteRendue > 0 && (
                      <span className="ml-1">
                        <Badge>Repris : {qte(l.quantiteRendue, l.unite)}</Badge>
                      </span>
                    )}
                    <p className="text-xs text-gray-500">
                      {qte(l.quantite, l.unite)} × {formaterFcfa(l.prixUnitaireTtc)} — TVA{' '}
                      {formaterTaux(l.tauxTvaBp)}
                      {l.remise > 0 && ` — remise ${formaterFcfa(l.remise)}`}
                    </p>
                  </td>
                  <td className="py-1 text-right whitespace-nowrap">{formaterFcfa(l.totalTtc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="space-y-1 border-t pt-2">
            <p className="flex justify-between">
              <span>Total HT</span>
              <span>{formaterFcfa(v.totalHt)}</span>
            </p>
            <p className="flex justify-between">
              <span>TVA</span>
              <span>{formaterFcfa(v.totalTva)}</span>
            </p>
            <p className="flex justify-between font-semibold">
              <span>Total TTC</span>
              <span>{formaterFcfa(v.totalTtc)}</span>
            </p>
          </div>
          <div className="border-t pt-2">
            {v.paiements.map((p) => (
              <p key={p.id} className="flex justify-between">
                <span>
                  {MODES[p.mode] ?? p.mode}
                  {p.reference && ` — réf. ${p.reference}`}
                  {p.statut === 'A_RAPPROCHER' && ' (à rapprocher)'}
                  {p.statut === 'ECART' && ' (écart signalé)'}
                </span>
                <span>{formaterFcfa(p.montant)}</span>
              </p>
            ))}
            {v.rendu > 0 && (
              <p className="text-gray-600">Monnaie rendue : {formaterFcfa(v.rendu)}</p>
            )}
          </div>
          {v.retours.length > 0 && (
            <div className="border-t pt-2">
              <p className="font-medium">Retours</p>
              {v.retours.map((r) => (
                <p key={r.id} className="flex justify-between">
                  <span>
                    {r.numeroTicket} — {formaterDate(r.creeLe)}
                  </span>
                  <span>-{formaterFcfa(r.totalTtc)}</span>
                </p>
              ))}
            </div>
          )}
          {actions?.(v, () => void refetch())}
        </div>
      )}
    </Modale>
  );
}
