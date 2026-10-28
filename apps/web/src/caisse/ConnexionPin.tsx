import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db, type Employe } from './db';
import { SaisiePin } from './Clavier';
import { PinRefuse, verifierPinLocal } from './pin-local';

export function ConnexionPin({ onConnecte }: { onConnecte: (e: Employe) => void }) {
  const personnel = useLiveQuery(() => db.personnel.orderBy('id').toArray(), []);
  const [choisi, setChoisi] = useState<Employe | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const valider = async (pin: string) => {
    if (!choisi) return;
    try {
      onConnecte(await verifierPinLocal(choisi.id, pin));
    } catch (e) {
      setErreur(e instanceof PinRefuse ? e.message : 'Vérification impossible.');
    }
  };

  if (!choisi) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="mb-4 text-xl font-semibold">Qui ouvre la caisse ?</h1>
        {personnel?.length === 0 && (
          <p className="text-gray-600">Aucun employé avec un PIN pour ce magasin.</p>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {personnel
            ?.slice()
            .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
            .map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setChoisi(p)}
                className="rounded-lg border bg-white p-4 text-left hover:bg-green-50"
              >
                <span className="block font-medium">{p.nom}</span>
                <span className="text-xs text-gray-500">
                  {p.role === 'CAISSIER'
                    ? 'Caissier'
                    : p.role === 'GERANT'
                      ? 'Gérant'
                      : 'Directeur'}
                </span>
              </button>
            ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm space-y-4 p-6">
      <button
        type="button"
        className="text-sm text-green-800 hover:underline"
        onClick={() => (setChoisi(null), setErreur(null))}
      >
        ← Changer de personne
      </button>
      <h1 className="text-center text-xl font-semibold">{choisi.nom}, saisissez votre PIN</h1>
      {erreur && (
        <p role="alert" className="text-center text-red-700">
          {erreur}
        </p>
      )}
      <SaisiePin onValider={(p) => void valider(p)} />
    </div>
  );
}
