import { type FormEvent, useState } from 'react';
import { api, formaterFcfa } from '../lib/api';
import { Bouton, Champ, MessageErreur, Modale } from '../ui';
import { ChoixGerant } from './ChoixGerant';
import type { InfosPoste, SessionLocale } from './db';
import { formaterQuantite } from './panier';
import { EnTeteImpression, imprimer, Impression } from './Ticket';

interface LigneVente {
  id: string;
  libelle: string;
  quantite: number;
  unite: 'PIECE' | 'KG';
  totalTtc: number;
  quantiteRendue: number;
}

interface Vente {
  id: string;
  numeroTicket: string;
  statut: string;
  creeLe: string;
  totalTtc: number;
  lignes: LigneVente[];
}

interface ResultatRetour {
  numeroTicket: string;
  ticketOrigine: string;
  rembourse: number;
  gerant: string;
  lignes: { libelle: string; quantite: number; unite: 'PIECE' | 'KG'; montant: number }[];
}

/** Reprise d'articles sur présentation du ticket (en ligne, PIN du gérant vérifié par le serveur). */
export function Retour({
  session,
  poste,
  onFermer,
}: {
  session: SessionLocale;
  poste: InfosPoste;
  onFermer: () => void;
}) {
  const [numero, setNumero] = useState('');
  const [vente, setVente] = useState<Vente | null>(null);
  const [quantites, setQuantites] = useState<Record<string, number>>({});
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState<unknown>(null);
  const [envoi, setEnvoi] = useState(false);
  const [resultat, setResultat] = useState<ResultatRetour | null>(null);

  const chercher = async (e: FormEvent) => {
    e.preventDefault();
    setErreur(null);
    try {
      const v = await api<Vente>(`/sales/ticket/${encodeURIComponent(numero.trim())}`, {
        auth: 'caisse',
      });
      setVente(v);
      setQuantites({});
    } catch (err) {
      setErreur(err);
    }
  };

  const lignes = Object.entries(quantites)
    .filter(([, q]) => q > 0)
    .map(([ligneId, quantite]) => ({ ligneId, quantite }));

  const valider = async (gerantId: string, pin: string) => {
    if (!vente) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await api<ResultatRetour>(`/sales/${vente.id}/return`, {
        auth: 'caisse',
        body: { sessionId: session.id, gerantId, pin, motif, lignes },
      });
      setResultat(r);
      imprimer();
    } catch (err) {
      setErreur(err);
    } finally {
      setEnvoi(false);
    }
  };

  if (resultat) {
    return (
      <Modale titre="Retour enregistré" onFermer={onFermer}>
        <p className="text-center text-2xl">
          À rembourser : <b>{formaterFcfa(resultat.rembourse)}</b>
        </p>
        <Impression>
          <EnTeteImpression poste={poste} />
          <hr />
          <p className="gras">Retour {resultat.numeroTicket}</p>
          <p>Ticket d’origine : {resultat.ticketOrigine}</p>
          <hr />
          {resultat.lignes.map((l, i) => (
            <p key={i} className="ligne">
              <span>
                {l.libelle} × {formaterQuantite(l.quantite, l.unite)}
              </span>
              <span>-{formaterFcfa(l.montant)}</span>
            </p>
          ))}
          <hr />
          <p className="ligne gras">
            <span>Remboursé (espèces)</span>
            <span>{formaterFcfa(resultat.rembourse)}</span>
          </p>
          <p>Validé par {resultat.gerant}</p>
        </Impression>
        <div className="mt-4 flex justify-end gap-2">
          <Bouton variante="secondaire" onClick={imprimer}>
            Réimprimer
          </Bouton>
          <Bouton onClick={onFermer}>Terminer</Bouton>
        </div>
      </Modale>
    );
  }

  return (
    <Modale titre="Retour d’articles" onFermer={onFermer}>
      <form onSubmit={(e) => void chercher(e)} className="flex items-end gap-2">
        <Champ
          label="Numéro du ticket"
          placeholder="M01-C01-000123"
          autoFocus
          className="flex-1"
          value={numero}
          onChange={(e) => setNumero(e.target.value.toUpperCase())}
        />
        <Bouton type="submit" variante="secondaire">
          Rechercher
        </Bouton>
      </form>
      <div className="mt-3">
        <MessageErreur erreur={erreur} />
      </div>
      {vente && (
        <div className="mt-3 space-y-3">
          {vente.statut !== 'VALIDEE' ? (
            <p className="text-red-700">Ce ticket est déjà un retour.</p>
          ) : (
            <>
              <ul className="divide-y text-sm">
                {vente.lignes.map((l) => {
                  const reste = l.quantite - l.quantiteRendue;
                  return (
                    <li key={l.id} className="flex items-center justify-between gap-2 py-2">
                      <div>
                        <p>{l.libelle}</p>
                        <p className="text-xs text-gray-600">
                          Vendu {formaterQuantite(l.quantite, l.unite)} — {formaterFcfa(l.totalTtc)}
                          {l.quantiteRendue > 0 &&
                            ` — déjà repris ${formaterQuantite(l.quantiteRendue, l.unite)}`}
                        </p>
                      </div>
                      {reste > 0 &&
                        (l.unite === 'KG' ? (
                          <label className="flex items-center gap-1 text-sm">
                            <input
                              type="checkbox"
                              checked={(quantites[l.id] ?? 0) > 0}
                              onChange={(e) =>
                                setQuantites({ ...quantites, [l.id]: e.target.checked ? reste : 0 })
                              }
                            />
                            Reprendre
                          </label>
                        ) : (
                          <input
                            type="number"
                            min={0}
                            max={reste}
                            aria-label={`Quantité reprise : ${l.libelle}`}
                            className="w-20 rounded border px-2 py-1"
                            value={quantites[l.id] ?? 0}
                            onChange={(e) =>
                              setQuantites({
                                ...quantites,
                                [l.id]: Math.min(reste, Math.max(0, Number(e.target.value))),
                              })
                            }
                          />
                        ))}
                    </li>
                  );
                })}
              </ul>
              <Champ
                label="Motif du retour"
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
              />
              {lignes.length > 0 && motif.trim().length >= 3 && (
                <>
                  <p className="text-sm font-medium">Validation par un gérant</p>
                  <ChoixGerant desactive={envoi} onPin={(g, pin) => void valider(g.id, pin)} />
                </>
              )}
            </>
          )}
        </div>
      )}
    </Modale>
  );
}
