import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Facturation } from '../commun/Facture';
import { api, formaterDate, formaterFcfa } from '../lib/api';
import { Badge, Bouton, Chargement, MessageErreur, Modale } from '../ui';
import { db, type InfosPoste, type VenteLocale } from './db';
import { imprimer, TicketImpression } from './Ticket';

/** Tickets conservés sur le poste (7 jours après envoi), pour réimpression et suivi de l'envoi. */
export function Historique({ poste, onFermer }: { poste: InfosPoste; onFermer: () => void }) {
  const ventes = useLiveQuery(() => db.ventes.orderBy('creeLe').reverse().limit(100).toArray(), []);
  const [aImprimer, setAImprimer] = useState<VenteLocale | null>(null);
  const [aFacturer, setAFacturer] = useState<VenteLocale | null>(null);
  if (aFacturer) return <FactureTicket vente={aFacturer} onFermer={() => setAFacturer(null)} />;
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
              {v.statut === 'ENVOYEE' && (
                <Bouton variante="discret" onClick={() => setAFacturer(v)}>
                  Facture
                </Bouton>
              )}
            </div>
          </li>
        ))}
        {ventes?.length === 0 && <li className="py-4 text-center text-gray-500">Aucun ticket.</li>}
      </ul>
      {aImprimer && <TicketImpression vente={aImprimer} poste={poste} />}
    </Modale>
  );
}

function FactureTicket({ vente, onFermer }: { vente: VenteLocale; onFermer: () => void }) {
  const { data, error, isLoading } = useQuery({
    queryKey: ['vente-caisse', vente.id],
    queryFn: () =>
      api<{ statut: string; facture: { id: string; numero: string } | null }>(
        `/sales/${vente.id}`,
        { auth: 'caisse' },
      ),
  });
  return (
    <Modale titre={`Facture — ticket ${vente.numeroTicket}`} onFermer={onFermer}>
      <p className="mb-2 text-sm">Total {formaterFcfa(vente.ticket.ttc)}</p>
      <MessageErreur erreur={error} />
      {isLoading || !data ? (
        <Chargement />
      ) : (
        <Facturation
          venteId={vente.id}
          estRetour={data.statut === 'RETOUR'}
          facture={data.facture}
          auth="caisse"
        />
      )}
    </Modale>
  );
}
