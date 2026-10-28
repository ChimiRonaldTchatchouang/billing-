import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { SaisiePin } from './Clavier';
import { db, type Employe } from './db';

/** Choix du gérant puis saisie de son PIN, vérifié par le serveur (actions en ligne). */
export function ChoixGerant({
  onPin,
  desactive,
}: {
  onPin: (gerant: Employe, pin: string) => void;
  desactive?: boolean;
}) {
  const gerants = useLiveQuery(
    () => db.personnel.filter((p) => p.role !== 'CAISSIER').toArray(),
    [],
  );
  const [choisi, setChoisi] = useState<Employe | null>(null);
  const gerant = choisi ?? (gerants?.length === 1 ? gerants[0]! : null);
  if (!gerant) {
    return (
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
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-center font-medium">PIN de {gerant.nom}</p>
      <SaisiePin desactive={desactive} onValider={(pin) => onPin(gerant, pin)} />
    </div>
  );
}
