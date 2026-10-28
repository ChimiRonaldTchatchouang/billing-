import { type ActionSensible, formaterNumeroTicket, uuidv7, type VenteSync } from '@caisse/shared';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { formaterFcfa } from '../lib/api';
import { Bouton, Champ, Modale } from '../ui';
import { rechercherLocal, trouverParCode } from './catalogue';
import {
  db,
  type Employe,
  ecrireMeta,
  type InfosPoste,
  lireMeta,
  type ProduitLocal,
  prochainNumero,
  type SessionLocale,
  type VenteLocale,
} from './db';
import { envoyerEnAttente } from './envoi';
import {
  ajouter,
  approuver,
  changerPrix,
  changerQuantite,
  formaterQuantite,
  lirePoids,
  type LignePanier,
  montantLigne,
  type Panier,
  panierVide,
  remiseLigne,
  retirer,
  totaux,
} from './panier';
import { Paiement, type PaiementSaisi } from './Paiement';
import { imprimer, TicketImpression } from './Ticket';
import { ValidationGerant } from './ValidationGerant';

interface Demande {
  titre: string;
  action: ActionSensible;
  details: string;
  appliquer: (p: Panier) => Panier;
}

type Saisie =
  | { type: 'poids'; produit: ProduitLocal }
  | { type: 'quantite'; ligne: LignePanier }
  | { type: 'remise'; ligne: LignePanier | null }
  | { type: 'prix'; ligne: LignePanier };

export function EcranVente({
  employe,
  session,
  poste,
}: {
  employe: Employe;
  session: SessionLocale;
  poste: InfosPoste;
}) {
  const [panier, setPanierEtat] = useState<Panier>(panierVide);
  const [code, setCode] = useState('');
  const [resultats, setResultats] = useState<ProduitLocal[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [demande, setDemande] = useState<Demande | null>(null);
  const [saisie, setSaisie] = useState<Saisie | null>(null);
  const [paiement, setPaiement] = useState(false);
  const [dernier, setDernier] = useState<VenteLocale | null>(null);
  const champ = useRef<HTMLInputElement>(null);
  const t = totaux(panier);

  // Le ticket en cours survit à un rechargement de la page.
  useEffect(() => {
    void lireMeta<Panier>('panier').then((p) => p && setPanierEtat(p));
  }, []);
  const setPanier = (p: Panier) => {
    setPanierEtat(p);
    void ecrireMeta('panier', p);
  };

  const refocus = () => requestAnimationFrame(() => champ.current?.focus());
  const modaleOuverte = demande || saisie || paiement;
  useEffect(() => {
    if (!modaleOuverte) refocus();
  }, [modaleOuverte]);

  // Recherche par nom pendant la frappe (pas pour un code-barres tapé par la douchette).
  useEffect(() => {
    if (!/[a-zA-Zà-ü]/.test(code)) {
      setResultats([]);
      return;
    }
    const id = setTimeout(() => void rechercherLocal(code).then(setResultats), 150);
    return () => clearTimeout(id);
  }, [code]);

  const ajouterProduit = (p: ProduitLocal) => {
    setCode('');
    setResultats([]);
    setMessage(null);
    if (p.unite === 'KG') setSaisie({ type: 'poids', produit: p });
    else setPanier(ajouter(panier, p));
  };

  const valider = async () => {
    const saisi = code.trim();
    if (!saisi) return;
    const p = await trouverParCode(saisi);
    if (p) return ajouterProduit(p);
    if (resultats.length === 1) return ajouterProduit(resultats[0]!);
    if (resultats.length === 0) {
      setMessage(`Article introuvable : ${saisi}`);
      setCode('');
    }
  };

  const touche = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') void valider();
    if (e.key === 'F2' && t) setPaiement(true);
  };

  const demanderGerant = (d: Demande) => setDemande(d);

  const encaisser = async (paiements: PaiementSaisi[], rendu: number) => {
    if (!t) return;
    const numero = formaterNumeroTicket(
      poste.magasin.code,
      poste.caisse.code,
      await prochainNumero(),
    );
    const vente: VenteSync = {
      id: panier.id,
      numeroTicket: numero,
      sessionId: session.id,
      userId: employe.id,
      creeLe: new Date().toISOString(),
      remiseTicket: panier.remiseTicket,
      lignes: panier.lignes.map((l) => ({
        productId: l.produit.id,
        libelle: l.produit.nom,
        prixUnitaireTtc: l.prixUnitaireTtc,
        quantite: l.quantite,
        unite: l.produit.unite,
        tauxTvaBp: l.produit.tauxTvaBp,
        remise: l.remise,
      })),
      paiements,
      approbations: panier.approbations,
    };
    const locale: VenteLocale = {
      id: vente.id,
      numeroTicket: numero,
      creeLe: vente.creeLe,
      statut: 'EN_ATTENTE',
      vente,
      ticket: {
        caissier: employe.nom,
        lignes: panier.lignes.map((l, i) => ({
          libelle: l.produit.nom,
          quantite: l.quantite,
          unite: l.produit.unite,
          prixUnitaireTtc: l.prixUnitaireTtc,
          net: t.lignes[i]!.net,
          remise: t.lignes[i]!.remiseLigne + t.lignes[i]!.remiseTicket,
        })),
        brut: t.brut,
        remise: t.remise,
        ht: t.ht,
        tva: t.tva,
        ttc: t.ttc,
        parTaux: t.parTaux,
        paiements: paiements.map((p) => ({ mode: p.mode, montant: p.montant })),
        rendu,
      },
    };
    await db.ventes.add(locale);
    setDernier(locale);
    setPaiement(false);
    setPanier(panierVide());
    imprimer();
    void envoyerEnAttente().catch(() => undefined);
  };

  const annulerTicket = () =>
    demanderGerant({
      titre: 'Annuler le ticket',
      action: 'ANNULATION_TICKET',
      details: `${panier.lignes.length} ligne(s), ${formaterFcfa(t?.ttc ?? 0)}`,
      appliquer: (p) => p,
    });

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 lg:flex-row">
      <section className="flex flex-1 flex-col rounded-lg border bg-white">
        <div className="relative border-b p-3">
          <input
            ref={champ}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={touche}
            disabled={Boolean(modaleOuverte)}
            placeholder="Scannez un article ou tapez son nom"
            aria-label="Code-barres ou nom de l’article"
            className="w-full rounded-md border border-gray-300 px-3 py-3 text-lg focus:border-green-600 focus:outline-none"
          />
          {message && (
            <p role="alert" className="mt-2 text-red-700">
              {message}
            </p>
          )}
          {resultats.length > 0 && (
            <ul className="absolute right-3 left-3 z-10 mt-1 max-h-80 overflow-y-auto rounded-md border bg-white shadow-lg">
              {resultats.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="flex w-full justify-between px-3 py-2 text-left hover:bg-green-50"
                    onClick={() => ajouterProduit(p)}
                  >
                    <span>{p.nom}</span>
                    <span className="text-gray-600">
                      {formaterFcfa(p.prixTtc)}
                      {p.unite === 'KG' ? '/kg' : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {panier.lignes.length === 0 ? (
            <p className="p-10 text-center text-gray-500">
              Ticket vide. Scannez le premier article.
            </p>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y">
                {panier.lignes.map((l, i) => {
                  const net = t?.lignes[i]?.net;
                  return (
                    <tr key={l.cle} className={i === 0 ? 'bg-green-50' : ''}>
                      <td className="px-3 py-2">
                        <p className="font-medium">{l.produit.nom}</p>
                        <p className="text-xs text-gray-600">
                          {formaterFcfa(l.prixUnitaireTtc)}
                          {l.produit.unite === 'KG' ? '/kg' : ''}
                          {l.prixUnitaireTtc !== l.produit.prixTtc && ' (prix modifié)'}
                          {l.remise > 0 && ` — remise ${formaterFcfa(l.remise)}`}
                        </p>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        {l.produit.unite === 'PIECE' ? (
                          <div className="flex items-center gap-1">
                            <Bouton
                              variante="secondaire"
                              className="px-3"
                              aria-label="Retirer une unité"
                              onClick={() =>
                                l.quantite > 1
                                  ? demanderGerant({
                                      titre: 'Diminuer la quantité',
                                      action: 'ANNULATION_LIGNE',
                                      details: `${l.produit.nom} : ${l.quantite} → ${l.quantite - 1}`,
                                      appliquer: (p) => changerQuantite(p, l.cle, l.quantite - 1),
                                    })
                                  : demanderGerant({
                                      titre: 'Retirer l’article',
                                      action: 'ANNULATION_LIGNE',
                                      details: `${l.produit.nom} retiré`,
                                      appliquer: (p) => retirer(p, l.cle),
                                    })
                              }
                            >
                              −
                            </Bouton>
                            <button
                              type="button"
                              className="min-w-10 text-center text-base font-medium"
                              onClick={() => setSaisie({ type: 'quantite', ligne: l })}
                            >
                              {l.quantite}
                            </button>
                            <Bouton
                              variante="secondaire"
                              className="px-3"
                              aria-label="Ajouter une unité"
                              onClick={() =>
                                setPanier(changerQuantite(panier, l.cle, l.quantite + 1))
                              }
                            >
                              +
                            </Bouton>
                          </div>
                        ) : (
                          <span>{formaterQuantite(l.quantite, 'KG')}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-medium whitespace-nowrap">
                        {net !== undefined && formaterFcfa(net)}
                      </td>
                      <td className="px-2 py-2 text-right whitespace-nowrap">
                        <Bouton
                          variante="discret"
                          onClick={() => setSaisie({ type: 'remise', ligne: l })}
                        >
                          Remise
                        </Bouton>
                        <Bouton
                          variante="discret"
                          onClick={() => setSaisie({ type: 'prix', ligne: l })}
                        >
                          Prix
                        </Bouton>
                        <Bouton
                          variante="discret"
                          onClick={() =>
                            demanderGerant({
                              titre: 'Retirer l’article',
                              action: 'ANNULATION_LIGNE',
                              details: `${l.produit.nom} retiré`,
                              appliquer: (p) => retirer(p, l.cle),
                            })
                          }
                        >
                          Retirer
                        </Bouton>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <aside className="flex w-full flex-col gap-3 lg:w-80">
        <div className="rounded-lg border bg-white p-4">
          <p className="flex justify-between text-sm text-gray-600">
            <span>Articles</span>
            <span>
              {panier.lignes.reduce((a, l) => a + (l.produit.unite === 'KG' ? 1 : l.quantite), 0)}
            </span>
          </p>
          {t && t.remise > 0 && (
            <p className="flex justify-between text-sm text-gray-600">
              <span>Remises</span>
              <span>-{formaterFcfa(t.remise)}</span>
            </p>
          )}
          <p className="mt-2 flex items-baseline justify-between">
            <span className="text-lg">Total</span>
            <span className="text-3xl font-bold">{formaterFcfa(t?.ttc ?? 0)}</span>
          </p>
        </div>
        <Bouton className="py-5 text-xl" disabled={!t} onClick={() => setPaiement(true)}>
          Encaisser (F2)
        </Bouton>
        <Bouton
          variante="secondaire"
          disabled={!t}
          onClick={() => setSaisie({ type: 'remise', ligne: null })}
        >
          Remise sur le ticket
        </Bouton>
        <Bouton variante="secondaire" disabled={!t} onClick={annulerTicket}>
          Annuler le ticket
        </Bouton>
        {dernier && (
          <div className="rounded-lg border bg-white p-3 text-sm">
            <p>
              Dernier ticket : <span className="font-mono">{dernier.numeroTicket}</span>
            </p>
            <p>
              Total {formaterFcfa(dernier.ticket.ttc)}
              {dernier.ticket.rendu > 0 && (
                <>
                  {' '}
                  — rendu <b>{formaterFcfa(dernier.ticket.rendu)}</b>
                </>
              )}
            </p>
            <Bouton variante="discret" className="px-0" onClick={imprimer}>
              Réimprimer
            </Bouton>
          </div>
        )}
      </aside>

      {dernier && <TicketImpression vente={dernier} poste={poste} />}

      {paiement && t && (
        <Paiement
          total={t.ttc}
          onFermer={() => setPaiement(false)}
          onValider={(p, r) => void encaisser(p, r)}
        />
      )}

      {saisie && (
        <SaisieValeur
          saisie={saisie}
          onFermer={() => setSaisie(null)}
          onValeur={(v) => {
            setSaisie(null);
            if (saisie.type === 'poids') setPanier(ajouter(panier, saisie.produit, v));
            else if (saisie.type === 'quantite') {
              const l = saisie.ligne;
              if (v > l.quantite) setPanier(changerQuantite(panier, l.cle, v));
              else if (v < l.quantite)
                demanderGerant({
                  titre: 'Diminuer la quantité',
                  action: 'ANNULATION_LIGNE',
                  details: `${l.produit.nom} : ${l.quantite} → ${v}`,
                  appliquer: (p) => changerQuantite(p, l.cle, v),
                });
            } else if (saisie.type === 'remise') {
              const l = saisie.ligne;
              demanderGerant({
                titre: 'Valider la remise',
                action: 'REMISE',
                details: l
                  ? `${l.produit.nom} : remise de ${formaterFcfa(v)}`
                  : `Remise de ${formaterFcfa(v)} sur le ticket`,
                appliquer: (p) => (l ? remiseLigne(p, l.cle, v) : { ...p, remiseTicket: v }),
              });
            } else {
              const l = saisie.ligne;
              demanderGerant({
                titre: 'Valider le changement de prix',
                action: 'MODIFICATION_PRIX',
                details: `${l.produit.nom} : ${formaterFcfa(l.prixUnitaireTtc)} → ${formaterFcfa(v)}`,
                appliquer: (p) => changerPrix(p, l.cle, v),
              });
            }
          }}
          maxRemise={
            saisie.type === 'remise'
              ? saisie.ligne
                ? montantLigne(
                    saisie.ligne.prixUnitaireTtc,
                    saisie.ligne.quantite,
                    saisie.ligne.produit.unite,
                  )
                : (t?.ttc ?? 0) + panier.remiseTicket
              : undefined
          }
        />
      )}

      {demande && (
        <ValidationGerant
          titre={demande.titre}
          onFermer={() => setDemande(null)}
          onValide={(gerant) => {
            if (demande.action === 'ANNULATION_TICKET') {
              const id = uuidv7();
              void db.evenements.add({
                id,
                envoye: 0,
                evenement: {
                  id,
                  userId: employe.id,
                  approbation: {
                    action: 'ANNULATION_TICKET',
                    approuveePar: gerant.id,
                    le: new Date().toISOString(),
                    details: demande.details,
                  },
                },
              });
              setPanier(panierVide());
            } else {
              setPanier(
                approuver(demande.appliquer(panier), demande.action, gerant.id, demande.details),
              );
            }
            setDemande(null);
          }}
        />
      )}
    </div>
  );
}

function SaisieValeur({
  saisie,
  onValeur,
  onFermer,
  maxRemise,
}: {
  saisie: Saisie;
  onValeur: (v: number) => void;
  onFermer: () => void;
  maxRemise?: number;
}) {
  const [valeur, setValeur] = useState('');
  const [pourcent, setPourcent] = useState(false);
  const titre = {
    poids: `Poids — ${saisie.type === 'poids' ? saisie.produit.nom : ''}`,
    quantite: 'Quantité',
    remise:
      saisie.type === 'remise' && saisie.ligne
        ? `Remise — ${saisie.ligne.produit.nom}`
        : 'Remise sur le ticket',
    prix: 'Nouveau prix TTC',
  }[saisie.type];

  let v: number | null = null;
  let erreur: string | null = null;
  if (valeur) {
    if (saisie.type === 'poids') {
      v = lirePoids(valeur);
      if (v === null) erreur = 'Poids en kg, par exemple 1,250';
    } else {
      const n = Number(valeur.replace(/\s/g, ''));
      if (!Number.isInteger(n) || n < 0) erreur = 'Nombre entier attendu.';
      else if (saisie.type === 'remise' && pourcent)
        v = n <= 100 ? Math.round(((maxRemise ?? 0) * n) / 100) : null;
      else v = n;
      if (v !== null && saisie.type === 'quantite' && v < 1) erreur = 'Au moins 1.';
      if (v !== null && saisie.type === 'remise' && v > (maxRemise ?? 0))
        erreur = 'La remise dépasse le montant.';
      if (v === null && !erreur) erreur = 'Pourcentage entre 0 et 100.';
    }
  }

  return (
    <Modale titre={titre} onFermer={onFermer}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (v !== null && !erreur) onValeur(v);
        }}
        className="space-y-3"
      >
        <Champ
          label={
            saisie.type === 'poids'
              ? 'Poids (kg)'
              : saisie.type === 'remise' && pourcent
                ? 'Remise (%)'
                : saisie.type === 'quantite'
                  ? 'Quantité'
                  : 'Montant (FCFA)'
          }
          inputMode="decimal"
          autoFocus
          value={valeur}
          onChange={(e) => setValeur(e.target.value)}
          erreur={erreur ?? undefined}
        />
        {saisie.type === 'remise' && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={pourcent}
              onChange={(e) => setPourcent(e.target.checked)}
            />{' '}
            En pourcentage
            {pourcent && v !== null && ` (${formaterFcfa(v)})`}
          </label>
        )}
        <div className="flex justify-end gap-2">
          <Bouton variante="secondaire" onClick={onFermer}>
            Annuler
          </Bouton>
          <Bouton type="submit" disabled={v === null || erreur !== null}>
            Valider
          </Bouton>
        </div>
      </form>
    </Modale>
  );
}
