import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Modale } from '../ui';
import { SaisiePin } from './Clavier';
import { db, type Employe } from './db';
import { PinRefuse, verifierPinLocal } from './pin-local';

/** Demande le PIN d'un gérant pour une action sensible (remise, annulation, prix). */
export function ValidationGerant({
  titre,
  onValide,
  onFermer,
}: {
  titre: string;
  onValide: (gerant: Employe) => void;
  onFermer: () => void;
}) {
  const gerants = useLiveQuery(
    () => db.personnel.filter((p) => p.role !== 'CAISSIER').toArray(),
    [],
  );
  const [choisi, setChoisi] = useState<Employe | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const unSeul = gerants?.length === 1 ? gerants[0]! : null;
  const gerant = choisi ?? unSeul;

  const valider = async (pin: string) => {
    if (!gerant) return;
    try {
      onValide(await verifierPinLocal(gerant.id, pin, 'GERANT'));
    } catch (e) {
      setErreur(e instanceof PinRefuse ? e.message : 'Vérification impossible.');
    }
  };

  return (
    <Modale titre={titre} onFermer={onFermer}>
      <p className="mb-3 text-sm text-gray-600">
        Cette action doit être validée par le PIN d’un gérant.
      </p>
      {!gerant ? (
        <div className="grid grid-cols-2 gap-2">
          {gerants?.map((g) => (
            <button
              key={g.id}
              type="button"
              className="rounded border p-3 text-left hover:bg-green-50"
              onClick={() => setChoisi(g)}
            >
              {g.nom}
            </button>
          ))}
          {gerants?.length === 0 && (
            <p className="text-sm text-red-700">Aucun gérant connu sur ce poste.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-center font-medium">{gerant.nom}</p>
          {erreur && (
            <p role="alert" className="text-center text-red-700">
              {erreur}
            </p>
          )}
          <SaisiePin onValider={(p) => void valider(p)} />
        </div>
      )}
    </Modale>
  );
}
