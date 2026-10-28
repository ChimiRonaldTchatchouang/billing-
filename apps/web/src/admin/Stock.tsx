import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api, formaterDate, formaterFcfa } from '../lib/api';
import { Badge, Bouton, Carte, Champ, Chargement, MessageErreur, Modale, Tableau } from '../ui';
import { SelecteurMagasin } from './SelecteurMagasin';
import { useMoi } from './session';
import type { Article } from './types';

interface LigneStock {
  productId: string;
  codeBarres: string;
  nom: string;
  unite: 'PIECE' | 'KG';
  quantite: number;
  seuilAlerte: number;
  prixTtc: number;
  dernierPrixAchat: number | null;
  enAlerte: boolean;
  negatif: boolean;
}

interface PageStock {
  magasin: { id: string; code: string; nom: string };
  total: number;
  page: number;
  parPage: number;
  articles: LigneStock[];
}

const quantite = (q: number, u: 'PIECE' | 'KG') =>
  u === 'KG' ? `${(q / 1000).toLocaleString('fr-FR')} kg` : q.toLocaleString('fr-FR');

export function Stock() {
  const moi = useMoi();
  const [storeId, setStoreId] = useState(moi.magasin?.id ?? '');
  const [recherche, setRecherche] = useState('');
  const [alerte, setAlerte] = useState(false);
  const [page, setPage] = useState(1);
  const [reception, setReception] = useState(false);
  const [ajustement, setAjustement] = useState<LigneStock | null>(null);
  const [historique, setHistorique] = useState<LigneStock | null>(null);
  const q = new URLSearchParams({
    page: String(page),
    ...(storeId ? { storeId } : {}),
    ...(recherche ? { recherche } : {}),
    ...(alerte ? { alerte: 'true' } : {}),
  });
  const { data, isLoading, error } = useQuery({
    queryKey: ['stock', storeId, recherche, alerte, page],
    queryFn: () => api<PageStock>(`/stock?${q}`),
    enabled: Boolean(storeId),
    placeholderData: keepPreviousData,
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.parPage)) : 1;

  return (
    <div className="space-y-4">
      <Carte
        titre={`Stock${data ? ` — ${data.magasin.code} ${data.magasin.nom}` : ''}`}
        actions={
          <Bouton onClick={() => setReception(true)} disabled={!storeId}>
            Réception de marchandises
          </Bouton>
        }
      >
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <SelecteurMagasin valeur={storeId} onChange={(id) => (setStoreId(id), setPage(1))} />
          <Champ
            label="Rechercher"
            value={recherche}
            onChange={(e) => (setRecherche(e.target.value), setPage(1))}
            className="max-w-xs"
          />
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              checked={alerte}
              onChange={(e) => (setAlerte(e.target.checked), setPage(1))}
            />{' '}
            Seulement les articles à commander
          </label>
        </div>
        <MessageErreur erreur={error} />
        {isLoading ? (
          <Chargement />
        ) : (
          <>
            <Tableau
              entetes={['Article', 'Code-barres', 'Quantité', 'Seuil', 'Dernier prix d’achat', '']}
              vide={data?.articles.length === 0}
            >
              {data?.articles.map((l) => (
                <tr key={l.productId}>
                  <td className="px-2 py-2">{l.nom}</td>
                  <td className="px-2 py-2 font-mono text-xs">{l.codeBarres}</td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    {quantite(l.quantite, l.unite)}{' '}
                    {l.negatif ? (
                      <Badge couleur="rouge">Négatif</Badge>
                    ) : (
                      l.enAlerte && <Badge couleur="orange">À commander</Badge>
                    )}
                  </td>
                  <td className="px-2 py-2">{l.seuilAlerte}</td>
                  <td className="px-2 py-2">
                    {l.dernierPrixAchat !== null ? formaterFcfa(l.dernierPrixAchat) : '—'}
                  </td>
                  <td className="space-x-2 px-2 py-2 text-right whitespace-nowrap">
                    <Bouton variante="discret" onClick={() => setAjustement(l)}>
                      Ajuster
                    </Bouton>
                    <Bouton variante="discret" onClick={() => setHistorique(l)}>
                      Mouvements
                    </Bouton>
                  </td>
                </tr>
              ))}
            </Tableau>
            <div className="mt-3 flex items-center justify-end gap-2 text-sm">
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
          </>
        )}
      </Carte>
      <Receptions storeId={storeId} />
      {reception && <FormulaireReception storeId={storeId} onFermer={() => setReception(false)} />}
      {ajustement && (
        <FormulaireAjustement
          storeId={storeId}
          ligne={ajustement}
          onFermer={() => setAjustement(null)}
        />
      )}
      {historique && (
        <Mouvements storeId={storeId} ligne={historique} onFermer={() => setHistorique(null)} />
      )}
    </div>
  );
}

function Receptions({ storeId }: { storeId: string }) {
  const { data } = useQuery({
    queryKey: ['receptions', storeId],
    queryFn: () =>
      api<
        {
          id: string;
          fournisseur: string;
          par: string;
          le: string;
          montantAchat: number;
          lignes: unknown[];
        }[]
      >(`/receipts?storeId=${storeId}`),
    enabled: Boolean(storeId),
  });
  return (
    <Carte titre="Dernières réceptions">
      <Tableau
        entetes={['Date', 'Fournisseur', 'Articles', 'Montant d’achat', 'Saisie par']}
        vide={data?.length === 0}
      >
        {data?.slice(0, 20).map((r) => (
          <tr key={r.id}>
            <td className="px-2 py-2">{formaterDate(r.le)}</td>
            <td className="px-2 py-2">{r.fournisseur}</td>
            <td className="px-2 py-2">{r.lignes.length}</td>
            <td className="px-2 py-2">{formaterFcfa(r.montantAchat)}</td>
            <td className="px-2 py-2">{r.par}</td>
          </tr>
        ))}
      </Tableau>
    </Carte>
  );
}

interface LigneReception {
  article: Article;
  quantite: string;
  prixAchat: string;
}

function FormulaireReception({ storeId, onFermer }: { storeId: string; onFermer: () => void }) {
  const qc = useQueryClient();
  const [fournisseur, setFournisseur] = useState('');
  const [recherche, setRecherche] = useState('');
  const [lignes, setLignes] = useState<LigneReception[]>([]);
  const resultats = useQuery({
    queryKey: ['articles-reception', recherche],
    queryFn: () =>
      api<{ articles: Article[] }>(
        `/products?${new URLSearchParams({ recherche, parPage: '10', actif: 'true' })}`,
      ),
    enabled: recherche.trim().length >= 2,
  });
  const enregistrer = useMutation({
    mutationFn: () =>
      api('/receipts', {
        body: {
          storeId,
          fournisseur,
          lignes: lignes.map((l) => ({
            productId: l.article.id,
            quantite:
              l.article.unite === 'KG'
                ? Math.round(Number(l.quantite.replace(',', '.')) * 1000)
                : Number(l.quantite),
            prixAchat: Number(l.prixAchat || 0),
          })),
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['stock'] });
      await qc.invalidateQueries({ queryKey: ['receptions'] });
      onFermer();
    },
  });
  const valider = (e: FormEvent) => {
    e.preventDefault();
    enregistrer.mutate();
  };
  return (
    <Modale titre="Réception de marchandises" onFermer={onFermer}>
      <form onSubmit={valider} className="space-y-3">
        <Champ
          label="Fournisseur"
          required
          value={fournisseur}
          onChange={(e) => setFournisseur(e.target.value)}
        />
        <Champ
          label="Ajouter un article (nom ou code-barres)"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />
        {resultats.data && recherche.length >= 2 && (
          <ul className="max-h-40 overflow-y-auto rounded border text-sm">
            {resultats.data.articles.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  className="w-full px-3 py-1 text-left hover:bg-green-50"
                  onClick={() => {
                    if (!lignes.some((l) => l.article.id === a.id)) {
                      setLignes([
                        ...lignes,
                        {
                          article: a,
                          quantite: '',
                          prixAchat: a.dernierPrixAchat ? String(a.dernierPrixAchat) : '',
                        },
                      ]);
                    }
                    setRecherche('');
                  }}
                >
                  {a.nom} <span className="text-gray-500">({a.codeBarres})</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {lignes.map((l, i) => (
          <div key={l.article.id} className="grid grid-cols-[1fr_6rem_7rem_auto] items-end gap-2">
            <p className="pb-2 text-sm">{l.article.nom}</p>
            <Champ
              label={l.article.unite === 'KG' ? 'Kg' : 'Quantité'}
              required
              value={l.quantite}
              onChange={(e) =>
                setLignes(lignes.map((x, j) => (j === i ? { ...x, quantite: e.target.value } : x)))
              }
            />
            <Champ
              label="Prix d’achat"
              required
              value={l.prixAchat}
              onChange={(e) =>
                setLignes(
                  lignes.map((x, j) =>
                    j === i ? { ...x, prixAchat: e.target.value.replace(/\D/g, '') } : x,
                  ),
                )
              }
            />
            <Bouton variante="discret" onClick={() => setLignes(lignes.filter((_, j) => j !== i))}>
              Retirer
            </Bouton>
          </div>
        ))}
        <MessageErreur erreur={enregistrer.error} />
        <div className="flex justify-end gap-2">
          <Bouton variante="secondaire" onClick={onFermer}>
            Annuler
          </Bouton>
          <Bouton type="submit" disabled={lignes.length === 0 || enregistrer.isPending}>
            Enregistrer la réception
          </Bouton>
        </div>
      </form>
    </Modale>
  );
}

function FormulaireAjustement({
  storeId,
  ligne,
  onFermer,
}: {
  storeId: string;
  ligne: LigneStock;
  onFermer: () => void;
}) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'inventaire' | 'variation'>('inventaire');
  const [valeur, setValeur] = useState('');
  const [motif, setMotif] = useState('');
  const versQuantite = (v: string) =>
    ligne.unite === 'KG' ? Math.round(Number(v.replace(',', '.')) * 1000) : Number(v);
  const enregistrer = useMutation({
    mutationFn: () =>
      api<{ avant: number; apres: number }>('/stock/adjustments', {
        body: {
          storeId,
          productId: ligne.productId,
          motif,
          ...(mode === 'inventaire'
            ? { quantiteReelle: versQuantite(valeur) }
            : { quantite: versQuantite(valeur) }),
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['stock'] });
      onFermer();
    },
  });
  return (
    <Modale titre={`Ajuster le stock — ${ligne.nom}`} onFermer={onFermer}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          enregistrer.mutate();
        }}
        className="space-y-3"
      >
        <p className="text-sm">Stock actuel : {quantite(ligne.quantite, ligne.unite)}</p>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1">
            <input
              type="radio"
              checked={mode === 'inventaire'}
              onChange={() => setMode('inventaire')}
            />{' '}
            Quantité comptée
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              checked={mode === 'variation'}
              onChange={() => setMode('variation')}
            />{' '}
            Variation (ex. −3 pour une casse)
          </label>
        </div>
        <Champ
          label={ligne.unite === 'KG' ? 'Kg' : 'Quantité'}
          required
          value={valeur}
          onChange={(e) => setValeur(e.target.value)}
        />
        <Champ
          label="Motif"
          required
          placeholder="Casse, vol, inventaire…"
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
        />
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

const TYPES: Record<string, string> = {
  VENTE: 'Vente',
  RECEPTION: 'Réception',
  AJUSTEMENT: 'Ajustement',
  RETOUR: 'Retour',
};

function Mouvements({
  storeId,
  ligne,
  onFermer,
}: {
  storeId: string;
  ligne: LigneStock;
  onFermer: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['mouvements', storeId, ligne.productId],
    queryFn: () =>
      api<
        {
          id: string;
          type: string;
          quantite: number;
          reference: string | null;
          par: string | null;
          le: string;
        }[]
      >(`/stock/${ligne.productId}/movements?storeId=${storeId}`),
  });
  return (
    <Modale titre={`Mouvements — ${ligne.nom}`} onFermer={onFermer}>
      {isLoading ? (
        <Chargement />
      ) : (
        <Tableau
          entetes={['Date', 'Type', 'Quantité', 'Référence', 'Par']}
          vide={data?.length === 0}
        >
          {data?.map((m) => (
            <tr key={m.id}>
              <td className="px-2 py-1 whitespace-nowrap">{formaterDate(m.le)}</td>
              <td className="px-2 py-1">{TYPES[m.type] ?? m.type}</td>
              <td className={`px-2 py-1 ${m.quantite < 0 ? 'text-red-700' : 'text-green-800'}`}>
                {m.quantite > 0 ? '+' : ''}
                {quantite(m.quantite, ligne.unite)}
              </td>
              <td className="px-2 py-1">{m.reference}</td>
              <td className="px-2 py-1">{m.par}</td>
            </tr>
          ))}
        </Tableau>
      )}
    </Modale>
  );
}
