import { formaterTaux } from '@caisse/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { api, ErreurApi, formaterFcfa } from '../lib/api';
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
import type { Article, Categorie } from './types';

interface Page {
  total: number;
  page: number;
  parPage: number;
  articles: Article[];
}

export function Articles() {
  const moi = useMoi();
  const peutModifier = moi.role !== 'CAISSIER';
  const [recherche, setRecherche] = useState('');
  const [page, setPage] = useState(1);
  const [edition, setEdition] = useState<Article | 'nouveau' | null>(null);
  const [importer, setImporter] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ['articles', recherche, page],
    queryFn: () => api<Page>(`/products?${new URLSearchParams({ recherche, page: String(page) })}`),
    placeholderData: keepPreviousData,
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.parPage)) : 1;

  return (
    <Carte
      titre="Articles"
      actions={
        peutModifier && (
          <div className="flex gap-2">
            <Bouton variante="secondaire" onClick={() => setImporter(true)}>
              Importer (Excel ou CSV)
            </Bouton>
            <Bouton onClick={() => setEdition('nouveau')}>Ajouter un article</Bouton>
          </div>
        )
      }
    >
      <Champ
        label="Rechercher"
        placeholder="Nom ou code-barres"
        value={recherche}
        onChange={(e) => {
          setRecherche(e.target.value);
          setPage(1);
        }}
        className="mb-3 max-w-sm"
      />
      <MessageErreur erreur={error} />
      {isLoading ? (
        <Chargement />
      ) : (
        <>
          <Tableau
            entetes={['Code-barres', 'Nom', 'Catégorie', 'Prix TTC', 'TVA', 'Unité', 'État', '']}
            vide={data?.articles.length === 0}
          >
            {data?.articles.map((a) => (
              <tr key={a.id}>
                <td className="px-2 py-2 font-mono text-xs">{a.codeBarres}</td>
                <td className="px-2 py-2">{a.nom}</td>
                <td className="px-2 py-2">{a.categorie ?? '—'}</td>
                <td className="px-2 py-2 whitespace-nowrap">
                  {formaterFcfa(a.prixTtc)}
                  {a.unite === 'KG' ? ' / kg' : ''}
                </td>
                <td className="px-2 py-2">{formaterTaux(a.tauxTvaBp)}</td>
                <td className="px-2 py-2">{a.unite === 'KG' ? 'Au poids' : 'Pièce'}</td>
                <td className="px-2 py-2">
                  {a.actif ? <Badge couleur="vert">En vente</Badge> : <Badge>Retiré</Badge>}
                </td>
                <td className="px-2 py-2 text-right">
                  {peutModifier && (
                    <Bouton variante="discret" onClick={() => setEdition(a)}>
                      Modifier
                    </Bouton>
                  )}
                </td>
              </tr>
            ))}
          </Tableau>
          <div className="mt-3 flex items-center justify-between text-sm text-gray-600">
            <span>{data?.total ?? 0} article(s)</span>
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
      {edition && (
        <FormulaireArticle
          article={edition === 'nouveau' ? null : edition}
          onFermer={() => setEdition(null)}
        />
      )}
      {importer && <ImportArticles onFermer={() => setImporter(false)} />}
    </Carte>
  );
}

function FormulaireArticle({
  article,
  onFermer,
}: {
  article: Article | null;
  onFermer: () => void;
}) {
  const qc = useQueryClient();
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => api<Categorie[]>('/categories'),
  });
  const [codeBarres, setCodeBarres] = useState(article?.codeBarres ?? '');
  const [nom, setNom] = useState(article?.nom ?? '');
  const [prixTtc, setPrixTtc] = useState(article ? String(article.prixTtc) : '');
  const [tauxTvaBp, setTaux] = useState(article?.tauxTvaBp ?? 1925);
  const [unite, setUnite] = useState<'PIECE' | 'KG'>(article?.unite ?? 'PIECE');
  const [seuilAlerte, setSeuil] = useState(String(article?.seuilAlerte ?? 0));
  const [categorieId, setCategorieId] = useState(article?.categorieId ?? '');
  const [nouvelleCategorie, setNouvelleCategorie] = useState('');
  const [actif, setActif] = useState(article?.actif ?? true);

  const enregistrer = useMutation({
    mutationFn: async () => {
      let cat = categorieId || null;
      if (nouvelleCategorie.trim()) {
        cat = (await api<Categorie>('/categories', { body: { nom: nouvelleCategorie.trim() } })).id;
      }
      const corps = {
        codeBarres,
        nom,
        prixTtc: Number(prixTtc.replace(/\s/g, '')),
        tauxTvaBp,
        unite,
        seuilAlerte: Number(seuilAlerte || 0),
        categorieId: cat,
      };
      return article
        ? api(`/products/${article.id}`, { method: 'PATCH', body: { ...corps, actif } })
        : api('/products', { body: corps });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['articles'] });
      await qc.invalidateQueries({ queryKey: ['categories'] });
      onFermer();
    },
  });
  const valider = (e: FormEvent) => {
    e.preventDefault();
    enregistrer.mutate();
  };

  return (
    <Modale titre={article ? 'Modifier l’article' : 'Nouvel article'} onFermer={onFermer}>
      <form onSubmit={valider} className="space-y-3">
        <Champ
          label="Code-barres"
          required
          value={codeBarres}
          onChange={(e) => setCodeBarres(e.target.value.trim())}
        />
        <Champ label="Nom" required value={nom} onChange={(e) => setNom(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Champ
            label={unite === 'KG' ? 'Prix TTC du kilo (FCFA)' : 'Prix TTC (FCFA)'}
            required
            inputMode="numeric"
            value={prixTtc}
            onChange={(e) => setPrixTtc(e.target.value.replace(/[^\d]/g, ''))}
          />
          <Choix label="TVA" value={tauxTvaBp} onChange={(e) => setTaux(Number(e.target.value))}>
            <option value={1925}>19,25 %</option>
            <option value={0}>0 % (exonéré)</option>
            {![0, 1925].includes(tauxTvaBp) && (
              <option value={tauxTvaBp}>{formaterTaux(tauxTvaBp)}</option>
            )}
          </Choix>
          <Choix
            label="Unité"
            value={unite}
            onChange={(e) => setUnite(e.target.value as 'PIECE' | 'KG')}
          >
            <option value="PIECE">À la pièce</option>
            <option value="KG">Au poids (kg)</option>
          </Choix>
          <Champ
            label="Seuil d’alerte de stock"
            inputMode="numeric"
            value={seuilAlerte}
            onChange={(e) => setSeuil(e.target.value.replace(/\D/g, ''))}
          />
        </div>
        <Choix
          label="Catégorie"
          value={categorieId}
          onChange={(e) => setCategorieId(e.target.value)}
        >
          <option value="">Aucune</option>
          {categories.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
        </Choix>
        <Champ
          label="… ou nouvelle catégorie"
          value={nouvelleCategorie}
          onChange={(e) => setNouvelleCategorie(e.target.value)}
        />
        {article && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={actif} onChange={(e) => setActif(e.target.checked)} />{' '}
            En vente
          </label>
        )}
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

const MODELE_CSV =
  'code_barres;nom;prix_ttc;taux_tva;unite;categorie;seuil_alerte;prix_achat\n6001234000011;Riz parfumé 5 kg;6500;19,25;PIECE;Épicerie;10;5200\n';

function ImportArticles({ onFermer }: { onFermer: () => void }) {
  const qc = useQueryClient();
  const [fichier, setFichier] = useState<File | null>(null);
  const envoyer = useMutation({
    mutationFn: () => {
      const f = new FormData();
      f.append('fichier', fichier!);
      return api<{ crees: number; modifies: number }>('/products/import', { body: f });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['articles'] }),
  });
  const erreurApi = envoyer.error instanceof ErreurApi ? envoyer.error : null;
  const modele = URL.createObjectURL(new Blob(['\uFEFF' + MODELE_CSV], { type: 'text/csv' }));

  return (
    <Modale titre="Importer des articles" onFermer={onFermer}>
      <div className="space-y-3 text-sm">
        <p>
          Fichier Excel (.xlsx) ou CSV. Colonnes obligatoires : <b>code_barres</b>, <b>nom</b>,{' '}
          <b>prix_ttc</b>. Facultatives : taux_tva (19,25 par défaut), unite (PIECE ou KG),
          categorie, seuil_alerte, prix_achat. Un article déjà connu (même code-barres) est mis à
          jour.
        </p>
        <a className="text-green-800 underline" href={modele} download="modele-articles.csv">
          Télécharger un modèle
        </a>
        <input
          type="file"
          accept=".xlsx,.csv"
          onChange={(e) => setFichier(e.target.files?.[0] ?? null)}
          className="block"
        />
        {envoyer.data && (
          <p className="rounded-md bg-green-50 p-3 text-green-800">
            Import terminé : {envoyer.data.crees} article(s) créé(s), {envoyer.data.modifies} mis à
            jour.
          </p>
        )}
        {erreurApi && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-800">
            <p>{erreurApi.message}</p>
            <ul className="mt-2 max-h-48 list-disc overflow-y-auto pl-5">
              {erreurApi.details.map((d, i) => (
                <li key={i}>
                  {d.ligne ? `Ligne ${d.ligne} : ` : ''}
                  {d.message}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Bouton variante="secondaire" onClick={onFermer}>
            Fermer
          </Bouton>
          <Bouton disabled={!fichier || envoyer.isPending} onClick={() => envoyer.mutate()}>
            {envoyer.isPending ? 'Import en cours…' : 'Importer'}
          </Bouton>
        </div>
      </div>
    </Modale>
  );
}
