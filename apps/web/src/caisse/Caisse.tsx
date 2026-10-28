import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Voyant } from '../components/Voyant';
import { useConnexion } from '../lib/use-connexion';
import { Bouton } from '../ui';
import { ConnexionPin } from './ConnexionPin';
import { type Employe, type InfosPoste, db } from './db';
import { Enregistrement } from './Enregistrement';
import { posteEnregistre, rafraichirPersonnel } from './poste';

export function Caisse() {
  const [enregistre, setEnregistre] = useState(posteEnregistre());
  const [employe, setEmploye] = useState<Employe | null>(null);
  const poste = useLiveQuery(
    async () => (await db.meta.get('poste'))?.valeur as InfosPoste | undefined,
    [],
  );
  const etat = useConnexion();

  useEffect(() => {
    if (enregistre && etat === 'EN_LIGNE') void rafraichirPersonnel().catch(() => undefined);
  }, [enregistre, etat]);

  if (!enregistre) return <Enregistrement onEnregistre={() => setEnregistre(true)} />;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="flex items-center justify-between border-b bg-white px-4 py-2">
        <div>
          <span className="font-semibold">
            Caisse {poste ? `${poste.magasin.code}-${poste.caisse.code}` : ''}
          </span>
          {employe && <span className="ml-3 text-sm text-gray-600">{employe.nom}</span>}
        </div>
        <div className="flex items-center gap-4">
          <Voyant etat={etat} enAttente={0} />
          {employe && (
            <Bouton variante="secondaire" onClick={() => setEmploye(null)}>
              Changer d’utilisateur
            </Bouton>
          )}
        </div>
      </header>
      {!employe ? (
        <ConnexionPin onConnecte={setEmploye} />
      ) : (
        <main className="flex flex-1 items-center justify-center p-4 text-gray-600">
          Écran de vente : sprint 3.
        </main>
      )}
    </div>
  );
}
