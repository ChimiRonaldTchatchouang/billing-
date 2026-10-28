import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Voyant } from '../components/Voyant';
import { definirJetonAppareil } from '../lib/api';
import { useConnexion } from '../lib/use-connexion';
import { Bouton } from '../ui';
import { ConnexionPin } from './ConnexionPin';
import { db, type Employe, effacerPoste, type InfosPoste } from './db';
import { EcranVente } from './EcranVente';
import { Enregistrement } from './Enregistrement';
import { Historique } from './Historique';
import { OuvertureSession } from './OuvertureSession';
import { posteEnregistre } from './poste';
import { useSynchronisation } from './synchronisation';

export function Caisse() {
  const [enregistre, setEnregistre] = useState(posteEnregistre());
  const [employe, setEmploye] = useState<Employe | null>(null);
  const [historique, setHistorique] = useState(false);
  const poste = useLiveQuery(
    async () => (await db.meta.get('poste'))?.valeur as InfosPoste | undefined,
    [enregistre],
  );
  const session = useLiveQuery(
    async () => (await db.sessions.where('statut').equals('OUVERTE').first()) ?? null,
    [],
  );
  const enAttente =
    useLiveQuery(() => db.ventes.where('statut').equals('EN_ATTENTE').count(), []) ?? 0;
  const rejetees = useLiveQuery(() => db.ventes.where('statut').equals('REJETEE').count(), []) ?? 0;
  const etat = useConnexion(enAttente);
  const { revoque, derniereErreur } = useSynchronisation(enregistre);

  if (!enregistre) return <Enregistrement onEnregistre={() => setEnregistre(true)} />;

  if (revoque && enAttente === 0) {
    return (
      <div className="mx-auto mt-20 max-w-md space-y-4 rounded-lg bg-white p-6 text-center shadow">
        <p>Ce poste n’est plus enregistré (caisse désactivée ou enregistrée sur un autre poste).</p>
        <Bouton
          onClick={async () => {
            definirJetonAppareil(null);
            await effacerPoste();
            setEnregistre(false);
          }}
        >
          Enregistrer à nouveau ce poste
        </Bouton>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-white px-4 py-2">
        <div>
          <span className="font-semibold">
            Caisse {poste ? `${poste.magasin.code}-${poste.caisse.code}` : ''}
          </span>
          {employe && <span className="ml-3 text-sm text-gray-600">{employe.nom}</span>}
        </div>
        <div className="flex items-center gap-3">
          <Voyant etat={etat} enAttente={enAttente} />
          {employe && (
            <>
              <Bouton variante="secondaire" onClick={() => setHistorique(true)}>
                Tickets
              </Bouton>
              <Bouton variante="secondaire" onClick={() => setEmploye(null)}>
                Changer d’utilisateur
              </Bouton>
            </>
          )}
        </div>
      </header>
      {(rejetees > 0 || derniereErreur || revoque) && (
        <div role="alert" className="bg-red-50 px-4 py-2 text-sm text-red-800">
          {revoque &&
            'Ce poste n’est plus enregistré : les ventes en attente ne peuvent pas être envoyées. Prévenez un gérant. '}
          {rejetees > 0 &&
            `${rejetees} vente(s) refusée(s) par le serveur : prévenez un gérant (voir « Tickets »). `}
          {derniereErreur}
        </div>
      )}
      {!employe ? (
        <ConnexionPin onConnecte={setEmploye} />
      ) : !poste || session === undefined ? (
        <p className="p-6 text-gray-500">Chargement…</p>
      ) : !session ? (
        <OuvertureSession employe={employe} />
      ) : (
        <EcranVente key={employe.id} employe={employe} session={session} poste={poste} />
      )}
      {historique && poste && <Historique poste={poste} onFermer={() => setHistorique(false)} />}
    </div>
  );
}
