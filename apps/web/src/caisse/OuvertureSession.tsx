import { uuidv7 } from '@caisse/shared';
import { type FormEvent, useState } from 'react';
import { Bouton, Champ } from '../ui';
import { db, type Employe } from './db';
import { envoyerEnAttente } from './envoi';

export function OuvertureSession({ employe }: { employe: Employe }) {
  const [fond, setFond] = useState('');
  const ouvrir = async (e: FormEvent) => {
    e.preventDefault();
    await db.sessions.add({
      id: uuidv7(),
      ouverteLe: new Date().toISOString(),
      ouvertePar: employe.id,
      fondDeCaisse: Number(fond || 0),
      statut: 'OUVERTE',
      envoyee: 0,
    });
    void envoyerEnAttente().catch(() => undefined);
  };
  return (
    <form
      onSubmit={(e) => void ouvrir(e)}
      className="mx-auto mt-10 max-w-sm space-y-4 rounded-lg bg-white p-6 shadow"
    >
      <h1 className="text-xl font-semibold">Ouvrir la caisse</h1>
      <p className="text-sm text-gray-600">
        Comptez le fond de caisse (monnaie présente dans le tiroir) avant de commencer.
      </p>
      <Champ
        label="Fond de caisse (FCFA)"
        inputMode="numeric"
        autoFocus
        required
        value={fond}
        onChange={(e) => setFond(e.target.value.replace(/\D/g, ''))}
      />
      <Bouton type="submit" className="w-full">
        Ouvrir la caisse
      </Bouton>
    </form>
  );
}
