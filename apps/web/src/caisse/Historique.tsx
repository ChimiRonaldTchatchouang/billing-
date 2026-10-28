import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { formaterDate, formaterFcfa } from '../lib/api';
import { Badge, Bouton, Modale } from '../ui';
import { db, type InfosPoste, type VenteLocale } from './db';
import { imprimer, TicketImpression } from './Ticket';

/** Tickets conservés sur le poste (7 jours après envoi), pour réimpression et suivi de l'envoi. */
export function Historique({ poste, onFermer }: { poste: InfosPoste; onFermer: () => void }) {
  const ventes = useLiveQuery(() => db.ventes.orderBy('creeLe').reverse().limit(100).toArray(), []);
  const [aImprimer, setAImprimer] = useState<VenteLocale | null>(null);
  return (
    <Modale titre="Tickets récents" onFermer={onFermer}>
      <ul className="divide-y text-sm">
        {ventes?.map((v) => (
          <li key={v.id} className="flex items-center justify-between gap-2 py-2">
            <div>
              <p className="font-mono">{v.numeroTicket}</p>
              <p className="text-xs text-gray-600">
                {formaterDate(v.creeLe)} — {formaterFcfa(v.ticket.ttc)}
              </p>
              {v.erreur && <p className="text-xs text-red-700">{v.erreur}</p>}
            </div>
            <div className="flex items-center gap-2">
              {v.statut === 'ENVOYEE' ? (
                <Badge couleur="vert">Envoyé</Badge>
              ) : v.statut === 'REJETEE' ? (
                <Badge couleur="rouge">Refusé</Badge>
              ) : (
                <Badge couleur="orange">En attente</Badge>
              )}
              <Bouton
                variante="discret"
                onClick={() => {
                  setAImprimer(v);
                  imprimer();
                }}
              >
                Réimprimer
              </Bouton>
            </div>
          </li>
        ))}
        {ventes?.length === 0 && <li className="py-4 text-center text-gray-500">Aucun ticket.</li>}
      </ul>
      {aImprimer && <TicketImpression vente={aImprimer} poste={poste} />}
    </Modale>
  );
}
